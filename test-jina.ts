import axios from 'axios';

async function test() {
  const url = 'https://thehill.com/homenews/campaign/5776875-live-results-illinois-gubernatorial-gop-primary/';
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await axios.get(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown"
      },
      timeout: 10000,
    });
    console.log("Success! Length:", response.data.length);
  } catch (error: any) {
    console.log("Error:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    }
  }
}
test();
