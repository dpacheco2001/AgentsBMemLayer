#Nodes functions for the graph
from typing import Any, Literal, Union
import uuid

from pydantic import BaseModel
from .state import OverallState
from langchain_core.runnables import RunnableConfig,RunnableLambda
from langgraph.store.base import BaseStore
from .configuration import Configuration as conf
from .models import Models
from . import tools
from . import prompts
from langchain_core.messages import SystemMessage, HumanMessage,ToolMessage
from langgraph.prebuilt import ToolNode
from langgraph.types import Command
import re


#Utils
def print_colored(text, color_code):
    print(f"\033[{color_code}m{text}\033[0m")
def unwrap_execute_query(texto):
    pattern = r"`{3}cypher\s*(.*?)\s*`{3}"  
    print_colored(f"Buscando query en texto: \n{texto}\n", 32)
    match = re.search(pattern, texto, re.DOTALL)
    if match:
        print_colored(f"Query encontrado: {match.group(1)}", 32)
        return match.group(1).strip()
    return None
tool_s = [tools.execute_query,tools.execute_tool]
#Basic Agent: 
#In init we have the state, the configuration, and the store that represents the long-term memory of our Agent.
#We gonna prepare a model with example tools for this template.
PRINCIPAL_MODEL_NAME="deepseek-v3"
using_deepseek = False
if (PRINCIPAL_MODEL_NAME.startswith("deepseek") ):
    using_deepseek = True
    print_colored(f"Using DeepSeek model: {PRINCIPAL_MODEL_NAME}", 32)
    model_with_tools= Models.get_model(PRINCIPAL_MODEL_NAME)
else:
    model_with_tools = Models.get_model(PRINCIPAL_MODEL_NAME).bind_tools(tool_s)


#---Tool Nodes: Prebuilt
def handle_tool_error(state: OverallState) -> dict:
    """
    Maneja errores de herramientas en el flujo de trabajo del grafo.

    :param state: El state debe contener por lo menos:
                  - "messages": Una lista de mensajes, donde el último mensaje será la respuesta de la toolcall, el cual será
                  el error.
    :return: En vez de parar la ejecución,  empaquetamos este error en un ToolMessage para mandarselo al agente.
    """
    tool_calls = state["messages"][-1].tool_calls
    return {
        "messages": [
            ToolMessage(
                content=f"Error: please fix your mistakes.",
                tool_call_id=tc["id"],
            )
            for tc in tool_calls
        ]
    }


def create_tool_node_with_fallback(tools: list) -> dict:
    """
    Crea un nodo con una lista de herramientas y agrega fallbacks
    para manejar errores en caso de fallos durante la ejecución.
    :param tools: Una lista de herramientas (tools) que se asignarán al nodo.
    :return: Un nodo de herramientas capaz de iterar entre fallbacks para corregirlos
    """
    return ToolNode(tools).with_fallbacks(
        [RunnableLambda(handle_tool_error)], exception_key="error"
    )

async def dig_into_memories(state: OverallState)-> dict:
    conversation_summary = []
    messages= state["messages"]
    if not using_deepseek:
        sys_prompt= prompts.EXAMPLE_SYS_PROMPT
        for msg in messages:
            if msg.type == "human":
                conversation_summary.append(f"User: {msg.content}")
            elif msg.type == "ai":
                if hasattr(msg, "tool_calls") and msg.tool_calls and (not msg.content or msg.content.strip() == ""):
                    tool_names = [tc.get("name", "unknown_tool") for tc in msg.tool_calls if "name" in tc]
                    conversation_summary.append(f"ToolCall: {', '.join(tool_names)}")
                else:
                    conversation_summary.append(f"Assistant: {msg.content}")
            elif msg.type == "tool":
                tool_name = getattr(msg, "name", "unknown_tool")
                conversation_summary.append(f"Tool Message ({tool_name}): {msg.content}")
            else:
                conversation_summary.append(f"{msg.type.capitalize()}: {msg.content}")
    else:
        sys_prompt= prompts.DEEPSEEK_SYS_PROMPT
        for msg in messages:
            if msg.type == "human":
                if msg.content.startswith("ToolMessage:"):
                    conversation_summary.append(f"ToolMessage: {msg.content}")
                else:
                    conversation_summary.append(f"User: {msg.content}")
            elif msg.type == "ai":
                query = unwrap_execute_query(msg.content)
                if query:
                    conversation_summary.append(f"Pensamiento intermedio: {msg.content} ")
                    conversation_summary.append(f"ToolCall: {query}")
                else:
                    conversation_summary.append(f"Assistant: {msg.content}")
                
    
    conversation_summary = "\n".join(conversation_summary)



    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    print_colored(conversation_summary, 32)
    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    
    response= model_with_tools.invoke([SystemMessage(content=sys_prompt),HumanMessage(content=str(conversation_summary))])
    return {"messages": response}


async def analazing_next_node(state: OverallState,config: RunnableConfig):

    messages = state["messages"]
    n_node= "__end__"
    ai_message = messages[-1]
    if not using_deepseek:
        if hasattr(ai_message, "tool_calls") and len(ai_message.tool_calls) > 0:
            return {
                "n_node":"tools2"
            }
        return  {
            "n_node": "__end__"
        }
    else:
        print_colored(f"Usando deepseek {PRINCIPAL_MODEL_NAME}, se procederá a ejecutar la query si es que la hay...", 32)
        query = unwrap_execute_query(ai_message.content)
        tool_message=f"ToolMessage: No results found for query: {query}"
        if query:
            results=await tools.execute_query_entry(query,config=config,first_entry=False)
            if results:
                tool_message=f"ToolMessage: {results}"     
                print_colored(f"{tool_message}", 37) 
            return {
                "messages": [HumanMessage(content=tool_message)],
                "n_node": "dig_into_memories"
            }
        else:
            print_colored(f"No query found in the message", 31)
            return {
                "n_node": "__end__"
            }
    
def dig_into_memories_tool_condition(state: OverallState):
    next_node = state["n_node"]
    print_colored(f"Next node: {next_node}", 32)
    return next_node
