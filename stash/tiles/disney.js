async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
}

async function main() {
  const AUTH =
    "Bearer ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84";
  const RAW =
    "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84";

  const r1 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/devices",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceFamily: "browser",
      applicationRuntime: "chrome",
      deviceProfile: "windows",
      attributes: {},
    }),
    timeout: 8,
  });

  if (r1.error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status1 = r1.response.status || r1.response.statusCode;

  if (status1 === 403 || (r1.data && r1.data.includes("403 ERROR"))) {
    $done({ content: "Restricted", backgroundColor: "#FF3B30" });
    return;
  }

  let assertion;
  try {
    assertion = JSON.parse(r1.data).assertion;
  } catch (e) {}
  if (!assertion) {
    $done({ content: "Error (" + status1 + ")", backgroundColor: "#FF9500" });
    return;
  }

  const r2 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/token",
    headers: {
      authorization: RAW,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body:
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange&latitude=0&longitude=0&platform=browser&subject_token=" +
      assertion +
      "&subject_token_type=urn%3Abamtech%3Aparams%3Aoauth%3Atoken-type%3Adevice",
    timeout: 8,
  });

  if (r2.error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status2 = r2.response.status || r2.response.statusCode;

  if (
    status2 === 403 ||
    (r2.data && r2.data.includes("forbidden-location"))
  ) {
    $done({ content: "Not Available", backgroundColor: "#FF3B30" });
    return;
  }

  let refreshToken;
  try {
    refreshToken = JSON.parse(r2.data).refresh_token;
  } catch (e) {}
  if (!refreshToken) {
    $done({ content: "Error (" + status2 + ")", backgroundColor: "#FF9500" });
    return;
  }

  const r3 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/graph/v1/device/graphql",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation refreshToken($input: RefreshTokenInput!) {\n  refreshToken(refreshToken: $input) {\n    activeSession {\n      sessionId\n    }\n  }\n}",
      variables: { input: { refreshToken } },
    }),
    timeout: 8,
  });

  if (r3.error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status3 = r3.response.status || r3.response.statusCode;
  const body3 = r3.data || "";

  if (status3 !== 200 || body3.includes("403 ERROR")) {
    $done({ content: "Error (" + status3 + ")", backgroundColor: "#FF9500" });
    return;
  }

  if (!/"inSupportedLocation"\s*:\s*true/.test(body3)) {
    $done({ content: "Not Available", backgroundColor: "#FF3B30" });
    return;
  }

  const match = body3.match(/"countryCode"\s*:\s*"([^"]+)"/);
  const region = match ? " (" + match[1].toUpperCase() + ")" : "";
  $done({ content: "Available" + region, backgroundColor: "#113CCF" });
}

(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: "Network Error", backgroundColor: "#FF9500" });
    });
})();
