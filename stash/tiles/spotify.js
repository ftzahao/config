async function request(method, params) {
  return new Promise((resolve) => {
    $httpClient[method.toLowerCase()](params, (error, response, data) => {
      resolve({ error, response, data });
    });
  });
}

async function main() {
  const { error, response, data } = await request("POST", {
    url: "https://spclient.wg.spotify.com/signup/public/v1/account",
    headers: { "Content-Type": "application/json", "Accept-Language": "en" },
    body:
      "birth_day=11&birth_month=11&birth_year=2000&collect_personal_info=undefined&creation_flow=&creation_point=https%3A%2F%2Fwww.spotify.com%2Fhk-en%2F&displayname=Gay%20Lord&gender=male&iagree=1&key=a1e486e2729f46d6bb368d6b2bcda326&platform=www&referrer=&send-email=0&thirdpartyemail=0&identifier_token=AgE6YTvEzkReHNfJpO114514",
    timeout: 8,
  });

  if (error) {
    $done({ content: "Network Error", backgroundColor: "#FF9500" });
    return;
  }

  const status = response.status || response.statusCode;

  if (status === 403) {
    $done({ content: "Restricted", backgroundColor: "#FF3B30" });
    return;
  }

  if (status !== 200) {
    $done({ content: "Error (" + status + ")", backgroundColor: "#FF9500" });
    return;
  }

  let json;
  try {
    json = JSON.parse(data);
  } catch (e) {
    $done({ content: "Error (parse)", backgroundColor: "#FF9500" });
    return;
  }

  if (json.status === 311 && json.is_country_launched) {
    const region = json.country ? " (" + String(json.country).toUpperCase() + ")" : "";
    $done({ content: "Available" + region, backgroundColor: "#1DB954" });
    return;
  }

  if (json.status === 320 || json.message === "country not launched") {
    $done({ content: "Not Available", backgroundColor: "#FF3B30" });
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
