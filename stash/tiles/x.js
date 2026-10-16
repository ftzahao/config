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
    url: "https://x.com/i/api/1.1/branch/init.json",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    },
    timeout: 8
  })

  if (error) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode

  if (status === 200) {
    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#1D9BF0" })
    return
  }

  if (status === 401 || status === 403) {
    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#1D9BF0" })
    return
  }

  if (status === 429) {
    $done({ content: isChinese() ? "请求限流" : "Rate Limited", backgroundColor: "#FF9500" })
    return
  }

  if (status >= 500) {
    $done({
      content: (isChinese() ? "服务端错误 (" : "Server Error (") + status + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  const body = (data || "").toLowerCase()

  if (body.includes("something went wrong") || body.includes("try again") || status === 404) {
    $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    return
  }

  $done({
    content: (isChinese() ? "错误 (" : "Error (") + status + ")",
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
