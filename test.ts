import axios from 'axios';

async function test() {
  try {
    const url = 'https://finance.yahoo.com/news/winklevoss-twins-sell-130m-bitcoin-115715521.html';
    const proxyUrl = `https://webcache.googleusercontent.com/search?q=cache:${url}`;
    const response = await axios.get(proxyUrl, { 
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      }
    });
    console.log(response.data.substring(0, 500));
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
test();
