async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://api.anthropic.com/v1/models",
    headers: {
      "x-api-key": "test",
      "anthropic-version": "2023-06-01",
    },
    timeout: 8,
  });

  if (error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status = response.status || response.statusCode;

  if (status === 403 || status === 451) {
    $done({ content: "Blocked", backgroundColor: "#FF3B30" });
    return;
  }

  if (status === 401 || status === 200) {
    $done({ content: "Available", backgroundColor: "#D97757" });
    return;
  }

  if (status === 429) {
    $done({ content: "Rate Limited", backgroundColor: "#FF9500" });
    return;
  }

  $done({ content: "Unknown (" + status + ")", backgroundColor: "#FF9500" });
}

(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "Network Error", backgroundColor: "#FF9500" });
    });
})();
