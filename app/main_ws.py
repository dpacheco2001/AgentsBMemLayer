import asyncio
import websockets
import json
import threading
from flask import Flask, jsonify
from flask_cors import CORS  # Importamos Flask-CORS
from myagent.graph import compilegraph
from langchain_core.messages import HumanMessage, ToolMessage
from myagent.utils import tools
from asyncio import WindowsSelectorEventLoopPolicy
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
from neo4j import GraphDatabase
from langchain_core.runnables import RunnableConfig
import datetime
import dotenv
import os
dotenv.load_dotenv()
def print_colored(text, color_code):
    print(f"\033[{color_code}m{text}\033[0m")
def convert_datetime(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    elif isinstance(value, dict):
        return {k: convert_datetime(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [convert_datetime(item) for item in value]
    else:
        return value

asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())

codigo = "20190051"
in_memory_checkpointer = MemorySaver()
long_term_in_memory = InMemoryStore()
template_graph = None


NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER")    
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


app = Flask(__name__)
CORS(app)  

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    with driver.session() as session:
        result = session.run("MATCH (n)-[r]->(m) RETURN n, r, m")
        nodes = {}
        links = []
        for record in result:
            n = record["n"]
            r = record["r"]
            m = record["m"]

            if n.id not in nodes:
                node_properties = dict(n._properties)
                node_properties = convert_datetime(node_properties)
                node_properties["id"] = n.id
                nodes[n.id] = node_properties

            if m.id not in nodes:
                node_properties = dict(m._properties)
                node_properties = convert_datetime(node_properties)
                node_properties["id"] = m.id
                nodes[m.id] = node_properties

            link_properties = dict(r._properties)
            link_properties = convert_datetime(link_properties)
            links.append({
                "source": n.id,
                "target": m.id,
                "type": r.type,
                "properties": link_properties
            })
        nodes_list = list(nodes.values())
        return jsonify({"nodes": nodes_list, "links": links})
    
@app.route('/api/graph-data/por-relacion/<relation_type>', methods=['GET'])
def get_nodes_by_relation(relation_type):
    with driver.session() as session:

        query = f"MATCH (n)-[r:{relation_type}]->() RETURN DISTINCT n"
        result = session.run(query)
        nodes = []
        for record in result:
            n = record["n"]
            node_properties = dict(n._properties)
            node_properties = convert_datetime(node_properties)
            node_properties["id"] = n.id
            nodes.append(node_properties)
        return jsonify({"nodes": nodes})
    
def run_flask():
    app.run(port=5001)

n = 0
async def process_message(websocket):
    global n
    config = {
        "configurable": {"thread_id": codigo, "codigo": codigo},
        "websocket": websocket,
        "driver": driver
    }
    async for message in websocket:
        if message.strip() == "exit":
            await websocket.send("Comando de salida recibido.")
            break

        memory_summary = f"Input_usuario:{message}"
        
        try:
            entry_query = """
                MATCH (n)
                WHERE n:CasoEstudio OR n:AsistenteVirtual OR n:Ensayo 
                RETURN n
            """
            if n==0:
                config_runnable = RunnableConfig(configurable=config)
                print_colored("Ejecutando consulta de entrada...",37)
                results=await tools.execute_query_entry(entry_query, config=config_runnable)
                n+=1
                memory_summary = f"Primera interacción: {message}, elige que nodo te sirve para responder el input y si ves algo que te ayude a responder ve excarvando memorias a partir de las relaciones.Puedes elegir tambien seguir excarvando un nodo que ya habias visto en tus memorias anteriores según el historial de chat:\n{results}"

        except Exception as e:
            print(f"Error al ejecutar la consulta: {e}")
          
        
        response = await template_graph.ainvoke({
            "messages": [HumanMessage(content=memory_summary)],
            "streaming_enable": True,
        }, config)

        print("\n--------------------------")
        print("Human:", message)
        print("--------------------------")
        if not isinstance(response["messages"][-1], ToolMessage):
            assistant_response = response["messages"][-1].content
        else:
            assistant_response = response["messages"][-2].content
        print("Assistant:", assistant_response)
        print("--------------------------\n")

        payload = {"AI": assistant_response}
        await websocket.send(json.dumps(payload))

def run_websocket_server():
    loop = asyncio.new_event_loop() 
    asyncio.set_event_loop(loop)

    async def start_server():
        server = await websockets.serve(process_message, "localhost", 6789)
        print("Servidor WebSocket iniciado en ws://localhost:6789")
        await asyncio.Future() 

    loop.run_until_complete(start_server())


def main():
    global template_graph
    template_graph = compilegraph(checkpointer=in_memory_checkpointer, long_term_memory=long_term_in_memory)
    
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    

    ws_thread = threading.Thread(target=run_websocket_server, daemon=True)
    ws_thread.start()
    try:
        while True:
            pass
    except KeyboardInterrupt:
        print("Cerrando la aplicación...")

if __name__ == "__main__":
    main()
