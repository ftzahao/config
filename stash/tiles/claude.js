async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data })
    })
  })
}

function isChinese() {
  const lang = ($environment.language || "").toLowerCase()
  return lang.startsWith("zh")
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://api.anthropic.com/v1/models",
    headers: {
      "x-api-key": "test",
      "anthropic-version": "2023-06-01"
    },
    timeout: 8
  })

  if (error) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode

  if (status === 403 || status === 451) {
    $done({ content: isChinese() ? "被封锁" : "Blocked", backgroundColor: "#FF3B30" })
    return
  }

  if (status === 401 || status === 200) {
    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#D97757" })
    return
  }

  if (status === 429) {
    $done({ content: isChinese() ? "请求限流" : "Rate Limited", backgroundColor: "#FF9500" })
    return
  }

  $done({
    content: (isChinese() ? "未知 (" : "Unknown (") + status + ")",
    backgroundColor: "#FF9500"
  })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
