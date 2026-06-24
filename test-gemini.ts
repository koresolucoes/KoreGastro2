import { GoogleGenAI } from '@google/genai';

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'getWeather',
          description: 'Get weather',
          parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' } } }
        }]
      }]
    }
  });

  console.log("sending user msg");
  let response = await chat.sendMessage({ message: 'What is the weather in Paris?' });
  console.log("got response", response.functionCalls);

  if (response.functionCalls) {
    const fnCalls = response.functionCalls;
    const fnResponses = fnCalls.map(call => ({
      functionResponse: { name: call.name, response: { weather: 'sunny' } }
    }));
    
    console.log("sending fn response", JSON.stringify(fnResponses));
    try {
      let res2 = await chat.sendMessage(fnResponses as any);
      console.log("res2 text", res2.text);
    } catch(e) {
      console.log("Error 1:", e);
      try {
        let res3 = await chat.sendMessage({ message: fnResponses as any });
        console.log("res3 text", res3.text);
      } catch (e2) {
        console.log("Error 2:", e2);
      }
    }
  }
}

run().catch(console.error);
