from neo4j import GraphDatabase
import time


uri = "bolt://localhost:7687"
user = "neo4j"
password = "mundial2022"


driver = GraphDatabase.driver(uri, auth=(user, password))


def consultar_nodos():
    with driver.session() as session:
        inicio = time.time()

        result = session.run("MATCH (n) RETURN n")
        fin = time.time()
        duracion_ms = (fin - inicio) * 1000
        print(f"⏱ Tiempo de consulta: {duracion_ms:.2f} ms")
        # for record in result:
        #     nodo = record["n"]
        #     print(f"🔹 Nodo: {dict(nodo)}")

        

# 🚀 Ejecutar
consultar_nodos()

# Cerrar conexión
driver.close()
