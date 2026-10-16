async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data })
    })
  })
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://www.google.com/generate_204",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    },
    timeout: 8
  })

  if (error) {
    $done({ content: "网络错误", backgroundColor: "#FF9500" })
    return
  }

  const status = response.status || response.statusCode

  if (status === 204) {
    $done({ content: "可用", backgroundColor: "#4285F4" })
    return
  }

  if (status === 200) {
    const body = (data || "").toLowerCase()
    if (body.includes("captcha") || body.includes("unusual traffic")) {
      $done({ content: "验证码", backgroundColor: "#FF9500" })
      return
    }
    $done({ content: "可用", backgroundColor: "#4285F4" })
    return
  }

  if (status === 429) {
    $done({ content: "请求限流", backgroundColor: "#FF9500" })
    return
  }

  if (status === 403 || status === 302 || status === 301) {
    $done({ content: "不可用", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: "错误 (" + status + ")", backgroundColor: "#FF9500" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "网络错误", backgroundColor: "#FF9500" })
    })
})()
