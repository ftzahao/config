async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
}

function header(headers, name) {
  const lower = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://www.tiktok.com/explore",
    "auto-redirect": false,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    timeout: 8,
  });

  if (error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status = response.status || response.statusCode;
  const headers = response.headers || {};
  const location = header(headers, "location") || "";
  const body = data || "";

  if (location && location.includes("/notfound")) {
    $done({ content: "Not Available", backgroundColor: "#FF3B30" });
    return;
  }

  if (status === 302 || status === 301) {
    $done({ content: "Redirect (" + status + ")", backgroundColor: "#FF9500" });
    return;
  }

  if (status === 403 || body.includes("access denied")) {
    $done({ content: "Restricted", backgroundColor: "#FF3B30" });
    return;
  }

  const match = body.match(/"region"\s*:\s*"(\w+)"/);

  if (status === 200 && match) {
    const region = " (" + match[1].toUpperCase() + ")";
    $done({ content: "Available" + region, backgroundColor: "#000000" });
    return;
  }

  if (status === 200) {
    $done({ content: "Available", backgroundColor: "#000000" });
    return;
  }

  if (status !== 200) {
    $done({ content: "Error (" + status + ")", backgroundColor: "#FF9500" });
    return;
  }

  $done({ content: "Unknown", backgroundColor: "#FF9500" });
}

(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "Network Error", backgroundColor: "#FF9500" });
    });
})();
