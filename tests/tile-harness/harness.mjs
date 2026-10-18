/**
 * Stash Tile 脚本本地测试台
 *
 * 用一个 `node:vm` 沙箱模拟 Stash 的 Tile JS 运行时，注入：
 *   $httpClient.get / .post(params, callback)   —— callback(error, response, data)
 *   $done(object)                               —— 面板更新 + 释放资源
 *   $environment / $argument / $script / console / setTimeout ...
 *
 * 设计要点（对齐真实 Stash 运行时，而不是"迁就"当前脚本的实现）：
 *   1. `$httpClient` 不是同步返回的：回调一定异步触发（真实网络请求永远不会同步完成）。
 *      这能暴露"回调里 throw，外层 Promise 永远 pending"这类挂死 bug。
 *   2. 回调（包括其中的 throw）在录制了之后被"吸收"，不向上抛给脚本 —— 等同于真实运行时。
 *      被吸收的异常记录到 `uncaught` / `errors`，并用 `wrapped.returned` 标记。
 *   3. 脚本 throw 出去的 Promise rejection（异步错误）记录到 `rejections` / `errors`。
 *   4. `$done` 无论调用多少次都全量记录到 `doneCalls`，第一个作为 `done`；
 *      从未调用时 `done === undefined` 且 `doneCalls.length === 0`，可区分
 *      "未调用" / "调用了但内容为空（{}）"。
 *   5. 同步错误（vm 内 try/catch）、setTimeout 内抛出、process 级 uncaught 都会被捕获到 `errors`。
 *
 * 用法：
 *   const result = await runTileScript({ scriptPath, responses, environment, timeoutMs })
 *
 * 返回（HarnessResult）：
 *   scriptPath, timedOut, done, doneCalls, requests, errors, rejections, uncaught,
 *   logs, consoleLogs, durationMs, options
 */
import vm from "node:vm"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HARNESS_DIR, "..", "..")
export const TILES_DIR = path.join(REPO_ROOT, "stash", "tiles")

/** 默认语言：与真实设备一致的中文环境 */
export const DEFAULT_LANGUAGE = "zh-Hans-CN"
export const DEFAULT_TIMEOUT_MS = 3000

/**
 * 注入到沙箱的宿主全局。
 * 直接复用宿主内置对象（而不是 vm 新 realm 里的），保证 `instanceof Promise`、
 * JSON 行为、Array 原型等与真实运行时一致 —— 否则脚本里 `data instanceof X`
 * 或异步实现会在沙箱中悄然失效。
 */
const CONTEXT_GLOBALS = (() => {
  const names = new Set(
    Object.getOwnPropertyNames(globalThis).filter(
      (name) =>
        ![
          "global",
          "globalThis",
          "GLOBAL",
          "root",
          "process",
          "require",
          "module",
          "exports",
          "Buffer",
          "fetch",
          "structuredClone",
          // Node 26 的 localStorage 全局在无 --localstorage-file 时会打警告；真实 Stash 也没有
          "localStorage",
        ].includes(name),
    ),
  )
  // 平台差异：个别内置在旧版本不存在时也不报错
  const map = {}
  for (const name of names) {
    if (typeof globalThis[name] !== "undefined") map[name] = globalThis[name]
  }
  return map
})()

const describeBag = (bag) => {
  if (Array.isArray(bag)) {
    return bag.length ? `已记录 ${bag.length} 次` : "空"
  }
  return bag && typeof bag === "object" && Object.keys(bag).length
    ? Object.keys(bag).join(", ")
    : "空"
}

/**
 * @typedef {Object} HarnessOptions
 * @property {string} scriptPath  被测脚本路径（绝对路径或相对仓库根目录）
 * @property {Array}  [responses] 按顺序消费的响应；项可为 {status,headers,body} / {error} / 函数 (params, index) => item
 * @property {Object} [environment] 覆盖默认 $environment（默认 {language: "zh-Hans-CN"}）
 * @property {string} [argument]   $argument 字符串
 * @property {number} [timeoutMs]  等待 $done 的时限，默认 3000
 * @property {Object} [script]     覆盖 $script（默认 {name: 文件名, startTime: Date.now()/1000}）
 * @property {(params:{url:string}) => (boolean|string)} [route] 路由守卫。
 *                                  返回 false/字符串时，该请求以网络错误失败（模拟当前策略下 URL 不可达）。
 * @property {boolean} [captureConsole] 是否把 console 输出收集到 logs（默认 true）
 * @property {boolean} [label]     仅用于报错的标签
 * @property {Array} [expectNoneLeft] 可选：断言 responses 全部被消费（在 run-all 里检查）
 */

function resolveScriptPath(scriptPath) {
  if (!scriptPath) throw new Error("runTileScript: 缺少 scriptPath")
  const variants = [scriptPath]
  // 允许只传脚本名（"google"）或 "google.js"
  if (!path.extname(scriptPath)) {
    variants.push(scriptPath + ".js")
    variants.push("stash/tiles/" + scriptPath + ".js")
  }
  const candidates = []
  for (const variant of variants) {
    candidates.push(
      path.isAbsolute(variant) ? variant : path.resolve(process.cwd(), variant),
      path.resolve(REPO_ROOT, variant),
      path.resolve(HARNESS_DIR, variant),
      path.join(TILES_DIR, path.basename(variant)),
    )
  }
  const tried = []
  for (const candidate of candidates) {
    if (tried.includes(candidate)) continue
    tried.push(candidate)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw new Error(`runTileScript: 找不到脚本 ${scriptPath}（已尝试 ${tried.join(", ")}）`)
}

function normaliseResponseItem(item, request, options = {}) {
  if (typeof item === "function") item = item(request, request.index)
  if ((item === undefined || item === null) && options.repeatLast && options.lastItem !== undefined) {
    // 多请求脚本（netflix / spotify / disney）用同一个行为覆盖所有请求
    item = options.lastItem
    if (typeof item === "function") item = item(request, request.index)
  }
  if (item === undefined || item === null) {
    throw new Error(
      `夹具耗尽：请求 #${request.index + 1} ${request.method} ${request.url} 没有对应的响应项`,
    )
  }
  if (typeof item !== "object") {
    throw new Error(`夹具耗尽：请求 #${request.index + 1} ${request.method} ${request.url} 没有对应的响应项`)
  }
  if (item.error !== undefined) {
    return {
      error: item.error === true ? "Network Error" : String(item.error),
      response: item.response,
      data: item.data,
    }
  }
  if (item.hang) {
    // 请求发出但永不返回（用于制造脚本挂起）
    return { hang: true, response: undefined, data: undefined }
  }
  return {
    error: null,
    response: {
      status: item.status ?? item.statusCode ?? 200,
      headers: item.headers ?? {},
    },
    data: item.body ?? item.data ?? "",
  }
}

/**
 * 运行一个 Tile 脚本。
 * @param {HarnessOptions} options
 * @returns {Promise<Object>} HarnessResult
 */
export async function runTileScript(options = {}) {
  const {
    scriptPath,
    responses = [],
    environment = {},
    argument = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    script = {},
    route,
    captureConsole = true,
  } = options

  const resolved = resolveScriptPath(scriptPath)
  const source = fs.readFileSync(resolved, "utf8")
  const scriptName = path.basename(resolved)

  /** @type {any[]} */
  const requests = []
  /** @type {any[]} */
  const doneCalls = []
  /** @type {any[]} */
  const errors = []
  /** @type {any[]} */
  const rejections = []
  /** @type {any[]} */
  const uncaught = []
  /** @type {any[]} */
  const consoleLogs = []
  /** @type {string[]} */
  const sandboxErrors = []
  /** @type {Set<Promise<any>>} */
  const pendingTimers = new Set()

  const startedAt = Date.now()
  const clone = (value) => {
    if (value === undefined) return undefined
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }

  let finished = false
  let hung = false
  let settle = null
  const completion = new Promise((resolve) => {
    settle = resolve
  })
  const finish = (reason) => {
    if (finished) return
    finished = true
    settle({ reason, timedOut: reason === "timeout" })
  }

  const guarded = (fn) => {
    if (finished) return
    try {
      fn()
    } catch (err) {
      uncaught.push(describeError(err, "runtime"))
      errors.push(describeError(err, "uncaught"))
      finish("throw")
    }
  }

  const captureError = (err, phase = "runtime") => {
    const info = describeError(err, phase)
    errors.push(info)
    return info
  }

  // ---- $done：全量记录，第一个作为 done ----
  const $done = (value) => {
    const call = {
      index: doneCalls.length,
      value: value === undefined ? undefined : clone(value),
      valueType:
        value === null
          ? "null"
          : Array.isArray(value)
            ? "array"
            : typeof value,
      at: Date.now() - startedAt,
    }
    doneCalls.push(call)
    finish("done")
  }

  // ---- $httpClient：顺序消费 responses，回调必定异步 ----
  const makeHttpMethod = (method) => (params, callback) => {
    const request = {
      index: requests.length,
      method: method.toUpperCase(),
      url: typeof params === "string" ? params : params && params.url,
      headers: params && typeof params === "object" ? clone(params.headers || {}) : {},
      body: params && typeof params === "object" ? params.body : undefined,
      timeout: params && typeof params === "object" ? params.timeout : undefined,
      "auto-redirect": params && typeof params === "object" ? params["auto-redirect"] : undefined,
      raw: clone(params),
    }
    requests.push(request)

    if (typeof callback !== "function") {
      captureError(
        new TypeError(`$httpClient.${method}() 缺少 callback（Tile 脚本必须提供回调）`),
        "schedule",
      )
      return
    }

    // 路由守卫：模拟某些 URL 在当前策略下不可达
    //   route(params) === false / "reason"  → 以网络错误失败（模拟需走代理的域名直连失败）
    //   route(params) === "skip"            → 网络层直接丢弃（请求发出但永不回调，用于制造挂起）
    if (typeof route === "function") {
      let verdict
      try {
        verdict = route(params || {})
      } catch {
        verdict = true
      }
      if (verdict === "skip") {
        hung = true
        return
      }
      if (verdict === false || typeof verdict === "string") {
        const reason =
          typeof verdict === "string" && verdict.length
            ? verdict
            : `Network Error: ${request.url} unreachable on this route`
        setTimeout(() => {
          guarded(() => callback(reason, undefined, undefined))
        }, 0)
        return
      }
    }

    let item
    try {
      item = normaliseResponseItem(responses[request.index], request, {
        repeatLast: Boolean(options.repeatLast),
        lastItem: responses[responses.length - 1],
      })
    } catch (err) {
      captureError(err, "fixture")
      return
    }

    request.responded = true
    if (item.hang) {
      hung = true
      return // 永不回调
    }

    // 真实网络请求一定有延迟；classify: "microtask" 用 queueMicrotask，其它用 setTimeout
    setTimeout(() => {
      guarded(() => callback(item.error ?? null, item.response, item.data))
    }, 0)
  }

  const $httpClient = {
    get: makeHttpMethod("get"),
    post: makeHttpMethod("post"),
    put: makeHttpMethod("put"),
    delete: makeHttpMethod("delete"),
    head: makeHttpMethod("head"),
    patch: makeHttpMethod("patch"),
    fetch(callback) {
      // Stash 的 $httpClient.fetch 语义与 get 相同，仅用于兼容
      return makeHttpMethod("get")({}, callback)
    },
  }

  // ---- 沙箱上下文 ----
  const context = vm.createContext({})

  for (const [name, value] of Object.entries(CONTEXT_GLOBALS)) {
    Object.defineProperty(context, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    })
  }

  const setTimeoutTracked = (fn, delay, ...args) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      guarded(() => fn(...args))
    }, delay)
    pendingTimers.add(timer)
    return timer
  }
  const setIntervalTracked = (fn, delay, ...args) => {
    const timer = setInterval(() => guarded(() => fn(...args)), delay)
    pendingTimers.add(timer)
    return timer
  }
  const clearTimer = (timer) => {
    pendingTimers.delete(timer)
    clearTimeout(timer)
    clearInterval(timer)
  }

  Object.assign(context, {
    $httpClient,
    $done,
    $environment: {
      language: DEFAULT_LANGUAGE,
      system: "macOS",
      version: "2.4.0",
      ...environment,
    },
    $argument: argument === undefined || argument === null ? "" : String(argument),
    $script: {
      name: scriptName,
      startTime: Math.floor(Date.now() / 1000),
      ...script,
    },
    $persistentStore: {
      read: () => null,
      write: () => true,
    },
    console: {
      log: (...args) => {
        if (captureConsole) consoleLogs.push({ level: "log", args: args.map(safeInspect) })
      },
      info: (...args) => {
        if (captureConsole) consoleLogs.push({ level: "info", args: args.map(safeInspect) })
      },
      warn: (...args) => {
        if (captureConsole) consoleLogs.push({ level: "warn", args: args.map(safeInspect) })
      },
      error: (...args) => {
        if (captureConsole) consoleLogs.push({ level: "error", args: args.map(safeInspect) })
      },
      debug: () => {},
    },
    setTimeout: setTimeoutTracked,
    setInterval: setIntervalTracked,
    clearTimeout: clearTimer,
    clearInterval: clearTimer,
    queueMicrotask: (fn) =>
      queueMicrotask(() => {
        guarded(fn)
      }),
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    AbortController,
    // 非 Stash 全局但脚本里偶尔出现的运行时 API；不提供 fetch（Stash 没有）
    __sandboxErrors: sandboxErrors,
  })
  // 沙箱里的 process 不可用；但允许脚本通过它报错时更容易定位问题
  Object.defineProperty(context, "process", {
    value: { env: {}, version: "sandbox", platform: "sandbox" },
    writable: true,
    configurable: true,
    enumerable: false,
  })
  // 让 vm 里的错误对象 className 与真实错误一致
  Object.defineProperty(context, "globalThis", { value: context, writable: true, configurable: true })

  const onUncaught = (err) => {
    uncaught.push(describeError(err, "process"))
    errors.push(describeError(err, "uncaught"))
    if (errors.length > 5) return
    finish("throw")
  }
  const onRejection = (reason) => {
    rejections.push(describeError(reason, "rejection"))
    errors.push(describeError(reason, "rejection"))
    // 未处理的 rejection 不结束脚本（真实运行时同样只是记日志），但记录下来
  }

  const timer = setTimeout(() => finish("timeout"), timeoutMs)
  process.on("uncaughtException", onUncaught)
  process.on("unhandledRejection", onRejection)

  let outcome
  try {
    const scriptObject = new vm.Script(source, { filename: resolved })
    try {
      scriptObject.runInContext(context, { displayErrors: true })
    } catch (err) {
      // 同步抛错（含 SyntaxError）——脚本只会跑一次的部分已完成
      captureError(err, "sync")
      finish("sync-throw")
    }

    const result = await completion
    outcome = result
  } finally {
    clearTimeout(timer)
    for (const pending of pendingTimers) {
      clearTimeout(pending)
      clearInterval(pending)
    }
    pendingTimers.clear()
    // 给沙箱里排队的微任务 / 已 expire 的 setTimeout 一点时间落盘
    await new Promise((resolve) => setTimeout(resolve, 5))
    process.off("uncaughtException", onUncaught)
    process.off("unhandledRejection", onRejection)
  }

  const durationMs = Date.now() - startedAt
  const finishedAfterTimeout = doneCalls.length > 0 && doneCalls[0].at > timeoutMs

  return {
    scriptPath: resolved,
    scriptName,
    // timedOut 语义：在 timeoutMs 内没有拿到 $done（即使之后兜底计时器又补了一次，也算超时）
    timedOut: Boolean(outcome && outcome.timedOut) || hung || finishedAfterTimeout,
    /** $done 是否在 timeoutMs 之后才被调用（脚本有兜底，但兜底晚于观察窗口） */
    finishedAfterTimeout,
    /** 从脚本启动到首次 $done 的真实耗时（无 $done 时为 null） */
    doneAfterMs: doneCalls.length ? doneCalls[0].at : null,
    outcome: outcome ? outcome.reason : "unknown",
    hungRequest: hung,
    done: doneCalls.length ? doneCalls[0].value : undefined,
    doneCall: doneCalls.length ? doneCalls[0] : undefined,
    doneCalls,
    requests,
    errors,
    rejections,
    uncaught,
    logs: consoleLogs,
    sandboxErrors,
    environment: clone(context.$environment),
    durationMs,
    options: { timeoutMs, argument, environment },
    /** 是否所有 responses 都被消费（夹具是否过短/过长） */
    consumed: requests.length,
    providedResponses: responses.length,
  }
}

/** 把错误对象（可能来自其它 realm）转成纯数据，便于日志输出 */
export function describeError(err, phase = "runtime") {
  if (err && typeof err === "object") {
    const name = err.name || err.constructor?.name || "Error"
    const message = err.message || String(err)
    const stack = typeof err.stack === "string" ? err.stack : undefined
    return {
      phase,
      name,
      message,
      stack,
      /** 区分"脚本抛的错"与"运行时/夹具的错" */
      raw: err,
    }
  }
  return { phase, name: typeof err, message: String(err), raw: err }
}

function safeInspect(value) {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * 便捷封装：村田式断言在 run-all 里；这里给 case 提供一个简写。
 * `expectDone(result, matcher)` 支持部分匹配 + 返回可读 diff。
 */
export function formatDone(doneCall, result) {
  if (!doneCall) {
    const hint = result
      ? `（timedOut=${result.timedOut}, outcome=${result.outcome}, requests=${result.requests.length}, errors=${result.errors.length}）`
      : ""
    return `$done 未被调用 ${hint}`
  }
  return `$done ${JSON.stringify(doneCall.value)}`
}

/** 由用例统一使用的“当前脚本必须正常收敛”的硬约束 */
export function assertCleanFinish(result, options = {}) {
  const problems = []
  if (result.errors.length) {
    problems.push(
      ...result.errors.map((error) => `[${error.phase}] ${error.name}: ${error.message}`),
    )
  }
  if (result.rejections.length) {
    problems.push(
      ...result.rejections.map((rejection) => `[rejection] ${rejection.name}: ${rejection.message}`),
    )
  }
  if (result.timedOut) {
    problems.push(
      result.hungRequest
        ? "脚本挂起：$done 超时未调用（某个 $httpClient 请求永不回调）"
        : `脚本挂起：${options.timeoutMs ?? "?"}ms 内未调用 $done`,
    )
  }
  return problems
}

export default runTileScript
