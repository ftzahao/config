async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data })
    })
  })
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://api.openai.com/compliance/cookie_requirements",
    timeout: 8
  })

  if (error) {
    $done({ content: "网络错误", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode
  const body = (data || "").toLowerCase()

  if (status !== 200) {
    $done({ content: "错误 (" + status + ")", backgroundColor: "#FF9500" })
    return
  }

  if (body.includes("unsupported_country")) {
    $done({ content: "被封锁", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: "可用", backgroundColor: "#10A37F" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "网络错误", backgroundColor: "#FF9500" })
    })
})()
