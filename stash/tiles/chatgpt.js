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
    url: "https://api.openai.com/compliance/cookie_requirements",
    timeout: 8
  })

  if (error) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode
  const body = (data || "").toLowerCase()

  if (status !== 200) {
    $done({
      content: (isChinese() ? "错误 (" : "Error (") + status + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (body.includes("unsupported_country")) {
    $done({ content: isChinese() ? "被封锁" : "Blocked", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#10A37F" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
