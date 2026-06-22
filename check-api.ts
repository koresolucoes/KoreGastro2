async function run() {
  try {
    const res = await fetch("http://127.0.0.1:3000/api/check");
    const text = await res.text();
    console.log("RESPONSE:", text);
  } catch(e) {
    console.error(e);
  }
}
run();
