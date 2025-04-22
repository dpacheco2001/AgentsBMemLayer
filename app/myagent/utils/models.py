#make sure you have your api keys in the .env file.
from dotenv import load_dotenv
from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_together import ChatTogether
from langchain_anthropic import ChatAnthropic
load_dotenv()

class Models:
    @classmethod
    def get_model(self,model_name,temperature=0,max_tokens=None,timeout=None,max_retries=3):
        deepseek_v3=  ChatTogether(
            model="deepseek-ai/DeepSeek-V3",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        deepseek_r1 = ChatDeepSeek(
            model="deepseek-reasoner",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries
        )

        gpt4omini = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries
        )

        gpt4o = ChatOpenAI(
            model="gpt-4o",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries
        )

        gemini_flash = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        gemini_lite = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-lite",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )
        claude_model = ChatAnthropic(model="claude-3-5-sonnet-20241022")

        learnlm = ChatGoogleGenerativeAI(
            model="learnlm-1.5-pro-experimental",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            max_retries=max_retries,
        )

        available_models = {
            "deepseek-chat": deepseek_v3,
            "deepseek-reasoner": deepseek_r1,
            "gpt-4o-mini": gpt4omini,
            "gpt-4o": gpt4o,
            "gemini-2.0-flash": gemini_flash,
            "claude_model": claude_model,
            "learnlm": learnlm,
            "deepseek-v3-sambanova": deepseek_v3_sambanova,
            "gemini-lite": gemini_lite,
        }

        return available_models[model_name]







