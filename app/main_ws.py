import asyncio
import websockets
import json
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
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
from openai import OpenAI
import subprocess
from icrawler.builtin import GoogleImageCrawler
import base64
import tempfile
import shutil
from icrawler.builtin import BingImageCrawler

dotenv.load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)



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

def format_value(value):
    if value is None:
        return "null"
    if not isinstance(value, str):
        value = str(value)
    try:
        float(value)
        return str(value)
    except ValueError:
        pass
    if value.lower() in ['true', 'false']:
        return value.lower()
    try:
        import json
        json.loads(value)
        return value
    except Exception:

        return "'" + value.replace("'", "\\'") + "'"


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

def run_frontend():
    print_colored("Iniciando el servidor de desarrollo de React...", 32)
    cwd = os.path.join(os.path.dirname(__file__), "frontend")
    print_colored(f"Directorio de trabajo: {cwd}", 34)

    subprocess.Popen(
        "npm run dev",
        cwd=cwd,
        shell=True
    )

# -------------------- Endpoints REST --------------------
USE_LOCAL = True #Lo utilizamos paraaa saber si usar el crawler o no, donde true es usar local y false es usar el crawler
METADATA_PATH = os.getenv("METADATA_PATH", "metadata.json") # Ruta al archivo de metadatos
LOCAL_DIR = os.getenv("LOCAL_DIR", "images") # Ruta al directorio local donde se guardan las imágenes

@app.route('/api/images', methods=['GET'])
def search_images():
    query = request.args.get('query','').strip().lower()
    if not query:
        return "Missing 'query'", 400

    results = []
    if USE_LOCAL:
        try:
            with open(METADATA_PATH, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        except Exception as e:
            return jsonify({"error": f"Failed to load metadata: {e}"}), 500

        for entry in metadata:
            name = entry.get("name","").lower()
            desc = entry.get("description","").lower()
            if query in name or query in desc:
                file_path = os.path.join(LOCAL_DIR, entry.get("file",""))
                if os.path.isfile(file_path):
                    with open(file_path, "rb") as imgf:
                        b64 = base64.b64encode(imgf.read()).decode()
                    results.append({"name": entry["name"], "data": b64})
                if len(results) >= 2:
                    break

    else:
        print_colored(f"Buscando imágenes en Bing para la consulta: {query}", 32)
        temp_dir = tempfile.mkdtemp(prefix="img_search_")
        try:
            crawler = BingImageCrawler(storage={'root_dir': temp_dir})
            crawler.crawl(keyword=query, max_num=2)
            for fname in os.listdir(temp_dir)[:2]:
                path = os.path.join(temp_dir, fname)
                with open(path,"rb") as imgf:
                    b64 = base64.b64encode(imgf.read()).decode()
                results.append({"name": fname, "data": b64})
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    block = "```images_encontradas\n"
    for img in results:
        block += f"nombre:{img['name']}\n"
        block += f"data:{img['data']}\n\n"
    block += "```"

    return block, 200, {"Content-Type":"text/plain"}

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    try:
        with driver.session() as session:
            nodes_result = session.run("MATCH (n) RETURN n")
            nodes = {}
            for record in nodes_result:
                n = record["n"]
                node_properties = dict(n._properties)
                node_properties = convert_datetime(node_properties)
                node_properties["elementId"] = str(n.id)
                node_properties["labels"] = list(n.labels)
                nodes[n.id] = node_properties

            rels_result = session.run("MATCH (n)-[r]->(m) RETURN r")
            links = []
            for record in rels_result:
                r = record["r"]
                link_properties = dict(r._properties)
                link_properties = convert_datetime(link_properties)
                links.append({
                    "source": str(r.start_node.id),
                    "target": str(r.end_node.id),
                    "type": r.type,
                    "properties": link_properties,
                    "id": r.element_id  
                })
            nodes_list = list(nodes.values())
            return jsonify({"nodes": nodes_list, "links": links})
    except Exception as e:
        return jsonify({"error": f"Error retrieving graph data: {str(e)}"}), 400

@app.route('/api/graph-data/por-relacion/<relation_type>', methods=['GET'])
def get_nodes_by_relation(relation_type):
    try:
        with driver.session() as session:
            query = f"MATCH (n)-[r:{relation_type}]->() RETURN DISTINCT n"
            result = session.run(query)
            nodes = []
            for record in result:
                n = record["n"]
                node_properties = dict(n._properties)
                node_properties = convert_datetime(node_properties)
                node_properties["elementId"] = str(n.id)
                node_properties["labels"] = list(n.labels)
                nodes.append(node_properties)
            return jsonify({"nodes": nodes})
    except Exception as e:
        return jsonify({"error": f"Error retrieving nodes by relation: {str(e)}"}), 400

@app.route('/api/post', methods=['POST'])
def execute_query_http():
    data = request.get_json()
    query = data.get("query")
    print_colored(f"Ejecutando consulta: {query}", 35)
    if not query:
        return jsonify({"error": "No query provided"}), 400
    try:
        with driver.session() as session:
            result = session.run(query)
            records = [record.data() for record in result]
            return jsonify(records)
    except Exception as e:
        return jsonify({"error": f"Error executing query: {str(e)}"}), 400

@app.route('/api/nodes', methods=['POST'])
def create_node():
    data = request.get_json()
    labels = data.get('labels', [])
    properties = data.get('properties', {})

    labelString = ":" + ":".join(labels) if labels else ""
    propsArray = [f"{key}: {format_value(value)}" for key, value in properties.items()]
    propsString = "{" + ", ".join(propsArray) + "}" if propsArray else "{}"
    query = f"CREATE (n{labelString} {propsString}) RETURN ID(n) as nodeId"
    print_colored(f"Ejecutando consulta para crear nodo: {query}", 35)
    try:
        with driver.session() as session:
            result = session.run(query)
            records = [record.data() for record in result]
            return jsonify(records)
    except Exception as e:
        return jsonify({"error": f"Error creating node: {str(e)}"}), 400

@app.route('/api/nodes/<node_id>', methods=['PUT'])
def update_node(node_id):
    data = request.get_json()
    properties = data.get('properties', {})
    labels = data.get('labels', [])
    try:
        with driver.session() as session:
            for key, value in properties.items():
                propQuery = f"MATCH (n) WHERE ID(n) = {node_id} SET n.{key} = {format_value(value)}"
                print_colored(f"Ejecutando consulta para actualizar propiedades: {propQuery}", 35)
                session.run(propQuery)
            if labels:
                setQuery = f"MATCH (n) WHERE ID(n) = {node_id} SET n:{':'.join(labels)}"
                print_colored(f"Ejecutando consulta para actualizar etiquetas: {setQuery}", 35)
                session.run(setQuery)
        return jsonify({"message": "Node updated successfully"})
    except Exception as e:
        print_colored(f"Error al actualizar el nodo: {e}", 31)
        return jsonify({"error": f"Error updating node: {str(e)}"}), 400

@app.route('/api/nodes/<node_id>/properties/<prop_key>', methods=['DELETE'])
def delete_property(node_id, prop_key):
    try:
        query = f"MATCH (n) WHERE ID(n) = {node_id} REMOVE n.{prop_key}"
        with driver.session() as session:
            session.run(query)
        return jsonify({"message": "Property deleted successfully"})
    except Exception as e:
        return jsonify({"error": f"Error deleting property: {str(e)}"}), 400

@app.route('/api/relationships', methods=['POST'])
def create_relationship():
    data = request.get_json()
    source = data.get('source')
    target = data.get('target')
    rel_type = data.get('type')
    if not source or not target or not rel_type:
        return jsonify({"error": "Missing source, target or relationship type"}), 400
    query = (
        f"MATCH (a), (b) "
        f"WHERE elementId(a) = '{source}' AND elementId(b) = '{target}' "
        f"CREATE (a)-[r:{rel_type}]->(b) RETURN elementId(r) as relId"
    )
    try:
        with driver.session() as session:
            result = session.run(query)
            records = [record.data() for record in result]
            return jsonify(records)
    except Exception as e:
        return jsonify({"error": f"Error creating relationship: {str(e)}"}), 400

@app.route('/api/generate_embedding/<label>', methods=['POST'])
def generate_embedding(label):
    try:
        print("Generando embedding para label:", label)

        query = f"MATCH (n:{label}) WHERE n.embedding IS NULL RETURN n"
        with driver.session() as session:
            result = session.run(query)
            nodes_to_update = [record["n"] for record in result]
            updated_count = 0
            for n in nodes_to_update:
                descripcion = n._properties.get("description")
                if not descripcion:
                    continue
                openai_response = client.embeddings.create(
                    input=descripcion,
                    model="text-embedding-3-small"
                )
                embedding_vector = openai_response.data[0].embedding
                update_query = f"MATCH (n) WHERE elementId(n) = '{n.element_id}' SET n.embedding = {json.dumps(embedding_vector)}"
                session.run(update_query)
                updated_count += 1
            return jsonify({"message": f"Embeddings generated for {updated_count} nodes with label '{label}'."})
    except Exception as e:
        return jsonify({"error": f"Error generating embeddings: {str(e)}"}), 400


@app.route('/api/vector-index/nodes', methods=['POST'])
def create_vector_index_nodes():
    data = request.get_json()
    indexName = data.get("indexName")
    label = data.get("label")
    propertyName = data.get("property", "embedding")
    dimensions = data.get("dimensions")
    similarityFunction = data.get("similarityFunction", "cosine")
    if not indexName or not label or not dimensions:
        return jsonify({"error": "Missing required parameters: indexName, label and dimensions are required"}), 400

    query = f"""
    CREATE VECTOR INDEX {indexName} IF NOT EXISTS
    FOR (n:{label})
    ON n.{propertyName}
    OPTIONS {{ indexConfig: {{ `vector.dimensions`: {dimensions}, `vector.similarity_function`: '{similarityFunction}' }} }}
    """
    try:
        with driver.session() as session:
            session.run(query)
        return jsonify({"message": f"Vector index '{indexName}' created for label '{label}'."})
    except Exception as e:
        return jsonify({"error": f"Error creating vector index: {str(e)}"}), 400

@app.route('/api/vector-index/relationships', methods=['POST'])
def create_vector_index_relationships():
    data = request.get_json()
    indexName = data.get("indexName")
    relType = data.get("relationshipType")
    propertyName = data.get("property", "embedding")
    dimensions = data.get("dimensions")
    similarityFunction = data.get("similarityFunction", "cosine")
    if not indexName or not relType or not dimensions:
        return jsonify({"error": "Missing required parameters: indexName, relationshipType and dimensions are required"}), 400

    query = f"""
    CREATE VECTOR INDEX {indexName} IF NOT EXISTS
    FOR ()-[r:{relType}]-() 
    ON r.{propertyName}
    OPTIONS {{ indexConfig: {{ `vector.dimensions`: {dimensions}, `vector.similarity_function`: '{similarityFunction}' }} }}
    """
    try:
        with driver.session() as session:
            session.run(query)
        return jsonify({"message": f"Vector index '{indexName}' created for relationship type '{relType}'."})
    except Exception as e:
        return jsonify({"error": f"Error creating vector index for relationships: {str(e)}"}), 400

@app.route('/api/vector-indexes', methods=['GET'])
def show_vector_indexes():
    query = "SHOW VECTOR INDEXES"
    try:
        with driver.session() as session:
            result = session.run(query)
            indexes = []
            for record in result:
                index_data = record.data()
                # Extraer parámetros del indexConfig
                options = index_data.get("options", {})
                index_config = options.get("indexConfig", {})
                
                formatted_index = {
                    "indexName": index_data.get("name"),
                    "label": index_data.get("labelsOrTypes", [""])[0],  # Primera etiqueta
                    "property": index_data.get("properties", [""])[0],  # Primera propiedad
                    "dimensions": index_config.get("vector.dimensions"),
                    "similarityFunction": index_config.get("vector.similarity_function", "cosine")
                }
                indexes.append(formatted_index)
                
            return jsonify({"vector_indexes": indexes})
    except Exception as e:
        return jsonify({"error": f"Error showing vector indexes: {str(e)}"}), 400

@app.route('/api/vector-search/nodes', methods=['POST'])
def vector_search_nodes():
    data = request.get_json()
    indexName = data.get("indexName")
    k = data.get("numberOfNearestNeighbours")
    query_text = data.get("queryVector")  # Recibir el texto plano
    
    if not isinstance(query_text, str):
        return jsonify({"error": "queryVector must be a text string"}), 400

    openai_response = client.embeddings.create(
        input=query_text,
        model="text-embedding-3-small"
    )
    queryVector = openai_response.data[0].embedding
    if not indexName or k is None or queryVector is None:
        return jsonify({"error": "Missing required parameters: indexName, numberOfNearestNeighbours and queryVector"}), 400

    query = f"""
    CALL db.index.vector.queryNodes('{indexName}', {k}, {json.dumps(queryVector)})
    YIELD node, score
    RETURN node, score
    """
    try:
        with driver.session() as session:
            result = session.run(query)
            records = [record.data() for record in result]
        return jsonify({"results": records})
    except Exception as e:
        return jsonify({"error": f"Error executing vector search: {str(e)}"}), 400

    


def run_flask():
    app.run(port=5001)

n = 0
async def process_message(websocket):
    global n
    config = {
        "configurable": {"thread_id": codigo, "codigo": codigo},
        "websocket": websocket,
        "driver": driver,
        "client": client,
    }
    async for message in websocket:
        if message.strip() == "exit":
            await websocket.send("Comando de salida recibido.")
            break


        response = await template_graph.ainvoke({
            "messages": [HumanMessage(content=message)],
            "informacion_trabajo": "Todavía no hay información de trabajo, se ha realizado una nueva interacción.Esperando razonamiento del asistente.",
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
    
    t_front = threading.Thread(target=run_frontend, daemon=True)
    t_front.start()
    
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

