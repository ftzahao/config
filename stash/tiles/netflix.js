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

async function checkTitle(id) {
  const { error, response } = await request("GET", "https://www.netflix.com/title/" + id)

  if (error) {
    return ""
  }

  const headers = response.headers || {}
  const url = headers["X-Originating-Url"] || headers["x-originating-url"] || ""
  if (!url) {
    return ""
  }

  const loc = url.split("/")[3]
  if (loc === "title") {
    return "us"
  }
  return loc.split("-")[0]
}

async function main() {
  let country = await checkTitle(70143836)
  if (country) {
    $done({
      content: (isChinese() ? "无限制 (" : "Full (") + country.toUpperCase() + ")",
      backgroundColor: "#E50914"
    })
    return
  }

  country = await checkTitle(80197526)
  if (country) {
    $done({
      content: (isChinese() ? "仅原创 (" : "Originals Only (") + country.toUpperCase() + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
