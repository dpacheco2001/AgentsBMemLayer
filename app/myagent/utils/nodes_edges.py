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
import json

#---------------Utils
def print_colored(text, color_code):
    print(f"\033[{color_code}m{text}\033[0m")
def unwrap_memory_query(texto):
    pattern = r"(?:```|´´´)\s*(Episodica|Semantica)\s*(.*?)\s*(?:```|´´´)"
    match = re.search(pattern, texto, re.DOTALL | re.IGNORECASE)
    
    if match:
        tipo = match.group(1).strip().lower()
        contenido = match.group(2).strip()
        modo = "episodic" if tipo == "episodica" else "semantic"
        return modo, contenido
    
    return None, None

def vector_search_nodes(type:str,query_text:str,k:int,driver,client):
    if type == "episodic":
        indexName = "episodic_index"
    elif type == "semantic":
        indexName = "semantic_index"


    openai_response = client.embeddings.create(
        input=query_text,
        model="text-embedding-3-small"
    )
    queryVector = openai_response.data[0].embedding
    query = f"""
    CALL db.index.vector.queryNodes('{indexName}', {k}, {json.dumps(queryVector)})
    YIELD node, score
    RETURN node, score
    """
    try:
        with driver.session() as session:
            result = session.run(query)
            records = [record.data() for record in result]
            resultados= []
            for record in records:
                node = record["node"]
                node_copy = dict(node)
                if "embedding" in node_copy:
                    del node_copy["embedding"]
        
                resultados.append(node_copy)
        return {"results": resultados}
    except Exception as e:
        return {"error": f"Error executing vector search: {str(e)}"}

PRINCIPAL_MODEL_NAME="gemini-2.0-flash"
print_colored(f"Using model: {PRINCIPAL_MODEL_NAME}", 32)
model_with_tools= Models.get_model(PRINCIPAL_MODEL_NAME)


async def dig_into_memories(state: OverallState)-> dict:
    conversation_summary = []
    messages= state["messages"]
    sys_prompt= prompts.MAIN_AGENT_SYS_PROMPT
    #Aca falta el resumen de la conversación,si es que hay más de 4 mensajes.
    for msg in messages[-4:]:
        if msg.type == "human":
            conversation_summary.append(f"Input: {msg.content}")
        elif msg.type == "ai":
            conversation_summary.append(f"Assistant: {msg.content}")
                
    
    conversation_summary = "\n".join(conversation_summary)
    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    print_colored(conversation_summary, 32)
    print_colored(f"---------------CONVERSATION SUMMARY------", 32)
    informacion_trabajo= state["informacion_trabajo"]
    #Construyendo el input:
    #1. Quien es robert
    #2. Historial de la conversación
    #3. Informacion de trabajo

    input_prompt=f"""
        >Quien eres? Eres robert, un asistente que ayudará al estudiante a resolver sus dudas.Estan en el laboratorio de materiales de la PUCP.
        >Historial de la conversación: {conversation_summary}
        >Informacion de trabajo: {informacion_trabajo}
    """
    response= model_with_tools.invoke([SystemMessage(content=sys_prompt),HumanMessage(content=str(input_prompt))])
    return {"messages": response}


async def analazing_next_node(state: OverallState,config: RunnableConfig):

    messages = state["messages"]
    n_node= "__end__"
    ai_message = messages[-1]
    configurable = config["configurable"]
    driver = configurable["driver"]
    client = configurable["client"]
    print_colored(f"Analizing next node...", 32)
    memory_type,query = unwrap_memory_query(ai_message.content)
    if memory_type and query:
        print_colored(f"Found memory query:",32)
        print_colored(f"Memory type: {memory_type}", 32)
        print_colored(f"Query: {query}", 32)
        #Performar la búsqueda vectorial
        k = 5
        results = vector_search_nodes(memory_type,query,k,driver,client)
        if results:
            print_colored(f"Results: {results}", 32)
            return{
                "n_node": "dig_into_memories",
                "informacion_trabajo": f"Información que pediste: \n{results}"
            }
        
    return {
        "n_node": "__end__"
    }
    
def dig_into_memories_tool_condition(state: OverallState):
    next_node = state["n_node"]
    print_colored(f"Next node: {next_node}", 32)
    return next_node
