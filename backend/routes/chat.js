import express from "express";
import router from "express.Router()";
import {Configuration,OpenAIApi} from "openai";

const configuration = new Configuration({
    apiKey:process.env.OPENAI_API_KEY,

})

const openai = new OpenAIApi(configuration);

router.post('/chat',async(req,res)=>{
    const {message} = req.body;
    try{
        const response = await openai.createCompletion({
            model:"text-davinci-003",
            prompt:message,
            max_tokens:150,
        });
        res.json({
            reply:response.data.choices[0].text
        })
    }catch(error){
        console.log(error.message);
        res.status(500).send("Error communicating with Chatgpt");
    }
    
});
 module.exports =  router;


