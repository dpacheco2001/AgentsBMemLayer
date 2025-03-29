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

def print_colored(text, color_code):
    print(f"\033[{color_code}m{text}\033[0m")

#Basic Agent: 
#In init we have the state, the configuration, and the store that represents the long-term memory of our Agent.
#We gonna prepare a model with example tools for this template.
tool_s = [tools.execute_query]
model_with_tools = Models.get_model("gpt-4o").bind_tools(tool_s)

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



async def entry_node_memory(state: OverallState, config: RunnableConfig) -> dict:
    entry_query = """
    MATCH (n)
    WHERE n:CasoEstudio OR n:AsistenteVirtual OR n:Ensayo 
    RETURN n
    """
    results =  tools.execute_query_entry(entry_query,config=config)
    conversation_summary = []
    messages= state["messages"]
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

    conversation_summary = "\n".join(conversation_summary)

    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    print_colored(conversation_summary, 32)
    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    
    memory_summary = "Nueva interacción, elige que nodo te sirve para responder el input y si ves algo que te ayude a responder ve excarvando memorias a partir de las relaciones.Puedes elegir tambien seguir excarvando un nodo que ya habias visto en tus memorias anteriores según el historial de chat\n"
    for record in results:
        node = record["n"]  
        memory_summary += f"Nodo Principal->Propiedades: {node}\n"
    
    sys_prompt= prompts.EXAMPLE_SYS_PROMPT
    response=model_with_tools.invoke([SystemMessage(content=sys_prompt),HumanMessage(content=conversation_summary),HumanMessage(content=str(memory_summary))])

    
    return {"messages": response}

async def dig_into_memories(state: OverallState)-> dict:
    conversation_summary = []
    messages= state["messages"]
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

    conversation_summary = "\n".join(conversation_summary)

    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    print_colored(conversation_summary, 32)
    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    tool_response= state["messages"][-1].content
    sys_prompt= prompts.EXAMPLE_SYS_PROMPT
    response= model_with_tools.invoke([SystemMessage(content=sys_prompt),HumanMessage(content=str(conversation_summary))])
    return {"messages": response}


def dig_into_memories_tool_condition(state: OverallState) -> Literal["tools2", "__end__"]:

    messages = state["messages"]
    ai_message = messages[-1]

    if hasattr(ai_message, "tool_calls") and len(ai_message.tool_calls) > 0:
        return "tools2"
    return "__end__"
