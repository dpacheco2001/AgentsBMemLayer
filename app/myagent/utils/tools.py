#Tools for the graph
from typing import Annotated, Literal, TypedDict, Set
import json
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore
from langgraph.prebuilt import InjectedStore
from .models import Models
from . import prompts
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage


def print_colored(text, color_code):
    print(f"\033[{color_code}m{text}\033[0m")
model_with_tools = Models.get_model("gemini-2.0-flash")
def clean_json_response(response_text):
    """
    Limpia la respuesta eliminando los delimitadores de código Markdown para JSON si existen.
    
    Args:
        response_text (str): El texto de respuesta que podría contener delimitadores de código JSON.
    
    Returns:
        str: El texto limpio sin los delimitadores.
    """
    # Verificar si comienza con ```json y termina con ```
    if response_text.strip().startswith("```json") and response_text.strip().endswith("```"):
        content = response_text.strip()
        content = content[7:]  
        content = content[:-3].strip() 
        return content
    

    if response_text.strip().startswith("```") and response_text.strip().endswith("```"):
        lines = response_text.strip().split('\n')
        content = '\n'.join(lines[1:-1])
        return content
    
    return response_text

@tool
async def execute_query(query: str,config: RunnableConfig,) -> list:
    """
    Herramienta: Ejecuta un query Cypher en la base de datos Neo4j.
    
    Args:
        query (str): El query Cypher a ejecutar.
    Returns:
        list: Lista de registros devueltos, donde cada registro es un diccionario.
              Si hay un error, devuelve una lista con un único diccionario que contiene el mensaje de error.
    """
    configurable = config["configurable"]
    websocket = configurable["websocket"]
    driver = configurable["driver"]
    prompt = prompts.POST_PROCESS_QUERY
    response = model_with_tools.invoke([SystemMessage(content=prompt), HumanMessage(content=str(query))])
    processed_query = response.content
    prompt_extract = prompts.EXTRACT_NODES_AND_RELATIONSHIPS_NAMES
    
    
    try:
        with driver.session() as session:
            result = session.run(processed_query)
            results = [record.data() for record in result]
            extract_name_and_relationships_result= model_with_tools.invoke([SystemMessage(content=prompt_extract), HumanMessage(content=str(results))])        
            names_and_relationships = extract_name_and_relationships_result.content
            names_and_relationships=clean_json_response(names_and_relationships)
            await websocket.send(names_and_relationships)
            return results
    except Exception as e:
        error_message = {"error": f"Error en la consulta: {str(e)}"}
        
        return [error_message]

@tool
def execute_tool(tool_name:str):
    """
    Se ejecuta una herramienta externa especificada en el bloque de memoria.
    Args:
        tool_name (str): Nombre de la herramienta externa a ejecutar.
    """
    print_colored(f"Ejecutando herramienta externa: {tool_name}", 35)
    return "Se ha ejecutado la herramienta {tool_name} correctamente."
    
async def execute_query_entry(query: str,config: RunnableConfig,first_entry=False) -> list:
    """
    Herramienta: Ejecuta un query Cypher en la base de datos Neo4j.
    
    Args:
        query (str): El query Cypher a ejecutar.
    Returns:
        list: Lista de registros devueltos, donde cada registro es un diccionario.
              Si hay un error, devuelve una lista con un único diccionario que contiene el mensaje de error.
    """
    configurable = config["configurable"]
    websocket = configurable["websocket"]
    driver = configurable["driver"]

    prompt_extract = prompts.EXTRACT_NODES_AND_RELATIONSHIPS_NAMES
    prompt_summary = prompts.EXTRACT_SUMMARY
    try:
        with driver.session() as session:
            print_colored(f"Ejecutando consulta de entrada...{query}",37)
            result = session.run(query)
            results = [record.data() for record in result]
            
            extract_name_and_relationships_result= model_with_tools.invoke([SystemMessage(content=prompt_extract), HumanMessage(content=str(results))])        
            names_and_relationships = extract_name_and_relationships_result.content
            names_and_relationships=clean_json_response(names_and_relationships)
            summary = model_with_tools.invoke([SystemMessage(content=prompt_summary), HumanMessage(content=str(results))])
            summary = clean_json_response(summary.content)
            print_colored(f"Resultados de la consulta de entrada: {summary}", 35)
            await websocket.send(names_and_relationships)
            return summary
    except Exception as e:
        error_message = {"error": f"Error en la consulta: {str(e)}"}
        
        return [error_message]
