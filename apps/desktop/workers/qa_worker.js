postMessage({
  type: "ready",
  text: "ready with " + (initialData && initialData.text ? initialData.text : "no initial data")
});

onMessage = function(data) {
  postMessage({
    type: "echo",
    text: "echo " + (data && data.text ? data.text : "empty message")
  });
};
