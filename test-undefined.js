async function run() {
  try {
    const fetchOptions = {
        method: 'POST',
        headers: { 'client-id': 'a' },
        body: undefined
    };
    await fetch('https://example.com', fetchOptions);
    console.log("Success");
  } catch (e) {
    console.log("Error:", e);
  }
}
run();
