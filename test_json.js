try {
  JSON.parse(undefined);
} catch (e) {
  console.log(e.message);
}
