async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data })
    })
  })
}

async function main() {
  const { error, response, data } = await request("GET", "https://www.youtube.com/premium")

  if (error) {
    $done({ content: "网络错误", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode
  const body = (data || "").toLowerCase()

  if (status !== 200 || body.length < 1000) {
    $done({ content: "错误 (" + status + ")", backgroundColor: "#FF9500" })
    return
  }

  if (body.includes("not available in your country")) {
    $done({ content: "不可用", backgroundColor: "#FF3B30" })
    return
  }

  const match = data.match(/"GL"\s*:\s*"([A-Z]{2})"/i)
  const country = match ? " (" + match[1] + ")" : ""
  $done({ content: "可用" + country, backgroundColor: "#FF0000" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "网络错误", backgroundColor: "#FF9500" })
    })
})()
