#!/usr/bin/env python
import argparse
import json
from neo4j import GraphDatabase
import os
import sys
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

# Get Neo4j connection details from environment variables or use defaults
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "mundial2022")

def connect_to_neo4j():
    """Establish connection to Neo4j database"""
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        # Test connection
        with driver.session() as session:
            session.run("RETURN 1")
        print(f"✅ Connected to Neo4j database at {NEO4J_URI}")
        return driver
    except Exception as e:
        print(f"❌ Failed to connect to Neo4j: {str(e)}")
        sys.exit(1)

def clean_database(driver):
    """Delete all nodes and relationships from the database"""
    try:
        with driver.session() as session:
            result = session.run("MATCH (n) DETACH DELETE n")
            result.consume()
        print(f"✅ Database cleaned successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to clean database: {str(e)}")
        return False

def export_database(driver, output_file):
    """Export all nodes and relationships from the database to a JSON file"""
    try:
        with driver.session() as session:
            # Verificar primero si hay nodos en la base de datos
            check_query = "MATCH (n) RETURN count(n) as node_count"
            check_result = session.run(check_query)
            node_count = check_result.single()["node_count"]
            
            if node_count == 0:
                print(f"⚠️ La base de datos está vacía (0 nodos encontrados)")
                # Crear un JSON vacío pero válido
                data = {"nodos": [], "relaciones": []}
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"✅ Se ha creado un archivo JSON vacío en {output_file}")
                return True
            
            # Si hay nodos, proceder con la exportación normal
            print(f"📊 Encontrados {node_count} nodos para exportar")
            
            # The query to extract all nodes and relationships, using elementId() instead of deprecated id()
            query = """
            MATCH (n)
            WITH COLLECT({
              id: elementId(n),
              labels: labels(n),
              properties: n {.*, embedding: null}
            }) AS nodos
            OPTIONAL MATCH (a)-[r]->(b)
            WITH nodos, COLLECT({
              id: CASE WHEN r IS NULL THEN null ELSE elementId(r) END,
              tipo: CASE WHEN r IS NULL THEN null ELSE type(r) END,
              origen: CASE WHEN a IS NULL THEN null ELSE elementId(a) END,
              destino: CASE WHEN b IS NULL THEN null ELSE elementId(b) END,
              properties: CASE WHEN r IS NULL THEN null ELSE properties(r) END
            }) AS relaciones_temp
            WITH nodos, [rel IN relaciones_temp WHERE rel.id IS NOT NULL] AS relaciones
            RETURN {nodos: nodos, relaciones: relaciones} AS resultado
            """
            
            result = session.run(query)
            record = result.single()
            
            if record and record["resultado"]:
                data = record["resultado"]
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"✅ Database exported successfully to {output_file}")
                print(f"  Exported {len(data.get('nodos', []))} nodes and {len(data.get('relaciones', []))} relationships")
                return True
            else:
                print("❌ No se pudo obtener datos de la base. Consulta devolvió resultado vacío.")
                return False
                
    except Exception as e:
        print(f"❌ Failed to export database: {str(e)}")
        return False

def clean_properties(properties):
    """Remove 'embedding' property and ensure properties are in correct format"""
    if not properties or len(properties) == 0:
        return {}
    
    # Create a copy to avoid modifying the original
    cleaned = properties.copy()
    
    # Remove embedding if present
    if 'embedding' in cleaned:
        del cleaned['embedding']
    
    return cleaned

def create_node(driver, node):
    """Create a node in Neo4j database"""
    node_id = node.get("id")
    etiquetas = node.get("etiquetas", [])
    
    # Algunas veces el campo puede ser "labels" en lugar de "etiquetas"
    if not etiquetas and "labels" in node:
        etiquetas = node.get("labels", [])
    
    # Puede ser "properties" o "propiedades"
    if "propiedades" in node:
        propiedades = clean_properties(node.get("propiedades", {}))
    elif "properties" in node:
        propiedades = clean_properties(node.get("properties", {}))
    else:
        propiedades = {}
    
    if node_id is None:
        return {"error": "Missing required field: id"}
    
    # Format labels for Cypher query
    labels_str = ":".join(etiquetas)
    if labels_str:
        labels_str = ":" + labels_str
    
    # Set the original ID as a property
    propiedades["original_id"] = node_id
    
    # Query to create node
    query = (
        "CREATE (n" + labels_str + " $propiedades) "
        "RETURN ID(n) as nodeId"
    )
    
    try:
        with driver.session() as session:
            result = session.run(
                query,
                propiedades=propiedades
            )
            record = result.single()
            if record:
                return {"success": True, "nodeId": record["nodeId"], "original_id": node_id}
            return {"success": False, "error": "No node created"}
    except Exception as e:
        return {"success": False, "error": str(e), "original_id": node_id}

def create_relationship(driver, relationship):
    """Create a relationship in Neo4j database"""
    origen = relationship.get("origen")
    destino = relationship.get("destino")
    tipo = relationship.get("tipo")
    
    # Puede ser "propiedades" o "properties"
    if "propiedades" in relationship:
        propiedades = clean_properties(relationship.get("propiedades", {}))
    elif "properties" in relationship:
        propiedades = clean_properties(relationship.get("properties", {}))
    else:
        propiedades = {}
    
    rel_id = relationship.get("id")
    
    if None in [origen, destino, tipo]:
        return {"error": "Missing required fields: origen, destino, or tipo"}
    
    # Set the original ID as a property
    if rel_id:
        propiedades["original_id"] = rel_id
    
    # La diferencia está aquí: generamos la consulta con el tipo directamente en el string
    # en lugar de usar un parámetro
    query = (
        "MATCH (a), (b) "
        "WHERE a.original_id = $origen AND b.original_id = $destino "
        f"CREATE (a)-[r:{tipo} $propiedades]->(b) "
        "RETURN elementId(r) as relId"
    )
    
    try:
        with driver.session() as session:
            result = session.run(
                query, 
                origen=origen, 
                destino=destino, 
                propiedades=propiedades
            )
            record = result.single()
            if record:
                return {"success": True, "relId": record["relId"], "original_id": rel_id}
            return {"success": False, "error": "No relationship created"}
    except Exception as e:
        return {"success": False, "error": str(e), "original_id": rel_id}

def process_json_file(file_path):
    """Read and parse JSON file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError:
        print(f"❌ Invalid JSON format in file: {file_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading file {file_path}: {str(e)}")
        sys.exit(1)

def extract_data(data):
    """Extract nodes and relationships from the specific JSON structure"""
    # Handle the specific structure of the JSON file
    if isinstance(data, list) and len(data) > 0 and "jsonResult" in data[0]:
        json_result = data[0]["jsonResult"]
        return json_result
    
    # If already in the expected format
    if isinstance(data, dict) and ("nodos" in data or "relaciones" in data):
        return data
    
    # Fallback
    return data

def main():
    parser = argparse.ArgumentParser(description="Import/export nodes and relationships between JSON and Neo4j")
    
    # Create subparsers for import and export commands
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Import command
    import_parser = subparsers.add_parser("import", help="Import data from JSON to Neo4j")
    import_parser.add_argument("json_file", help="Path to JSON file containing nodes and/or relationships")
    import_parser.add_argument("--dry-run", action="store_true", help="Print queries without executing them")
    import_parser.add_argument("--nodes-only", action="store_true", help="Import only nodes, ignore relationships")
    import_parser.add_argument("--relationships-only", action="store_true", help="Import only relationships, ignore nodes")
    import_parser.add_argument("--no-clean", action="store_true", help="Don't clean the database before importing")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export data from Neo4j to JSON")
    export_parser.add_argument("output_file", help="Path to save the exported JSON data")
    
    args = parser.parse_args()
    
    # Default to import command if no command is specified (for backward compatibility)
    if args.command is None:
        if len(sys.argv) > 1:
            args.command = "import"
            args.json_file = sys.argv[1]
            args.dry_run = "--dry-run" in sys.argv
            args.nodes_only = "--nodes-only" in sys.argv
            args.relationships_only = "--relationships-only" in sys.argv
            args.no_clean = "--no-clean" in sys.argv
        else:
            parser.print_help()
            sys.exit(1)
    
    # Connect to Neo4j for both import and export
    driver = connect_to_neo4j()
    
    if args.command == "export":
        # Export database to JSON file
        if export_database(driver, args.output_file):
            print("✅ Export completed successfully")
        else:
            print("❌ Export failed")
    
    elif args.command == "import":
        # Load data from JSON file
        raw_data = process_json_file(args.json_file)
        
        # Extract data from the specific JSON structure
        data = extract_data(raw_data)
        
        # Clean database if not in dry-run mode and --no-clean not specified
        if not args.dry_run and not args.no_clean:
            print("🔄 Cleaning database...")
            if not clean_database(driver):
                print("⚠️ Failed to clean database, proceeding with import anyway")
        elif args.dry_run:
            print("🔍 DRY RUN MODE - No changes will be made to the database")
        
        # Import nodes if present and not in relationships-only mode
        if "nodos" in data and not args.relationships_only:
            nodes = data.get("nodos", [])
            if nodes:
                print(f"🔄 Processing {len(nodes)} nodes...")
                
                node_results = {
                    "success": 0,
                    "failed": 0,
                    "failures": []
                }
                
                for node in nodes:
                    # Print the node without embedding in dry run mode
                    if args.dry_run:
                        node_copy = node.copy()
                        if "propiedades" in node_copy and "embedding" in node_copy["propiedades"]:
                            node_copy["propiedades"] = node_copy["propiedades"].copy()
                            del node_copy["propiedades"]["embedding"]
                        elif "properties" in node_copy and "embedding" in node_copy["properties"]:
                            node_copy["properties"] = node_copy["properties"].copy()
                            del node_copy["properties"]["embedding"]
                        print(f"Would create node: {node_copy}")
                        continue
                    
                    result = create_node(driver, node)
                    
                    if result.get("success", False):
                        node_results["success"] += 1
                        print(f"✅ Created node with ID: {result['nodeId']} (Original ID: {node.get('id')})")
                    else:
                        node_results["failed"] += 1
                        error_info = {
                            "original_id": result.get("original_id"),
                            "error": result.get("error")
                        }
                        node_results["failures"].append(error_info)
                        print(f"❌ Failed to create node with ID: {node.get('id')}")
                        print(f"   Error: {result.get('error')}")
                
                print("\n📊 Node Import Summary:")
                print(f"  Total nodes: {len(nodes)}")
                print(f"  Successfully created: {node_results['success']}")
                print(f"  Failed: {node_results['failed']}")
                
                if node_results["failed"] > 0:
                    print("\n❌ Failed nodes:")
                    for fail in node_results["failures"]:
                        print(f"  Node ID: {fail['original_id']} - Error: {fail['error']}")
        
        # Import relationships if present and not in nodes-only mode
        if "relaciones" in data and not args.nodes_only:
            relationships = data.get("relaciones", [])
            if relationships:
                print(f"\n🔄 Processing {len(relationships)} relationships...")
                
                rel_results = {
                    "success": 0,
                    "failed": 0,
                    "failures": []
                }
                
                # Process each relationship
                for rel in relationships:
                    if args.dry_run:
                        # Just print relationship info in dry run mode
                        rel_copy = rel.copy()
                        if "propiedades" in rel_copy and "embedding" in rel_copy["propiedades"]:
                            rel_copy["propiedades"] = rel_copy["propiedades"].copy()
                            del rel_copy["propiedades"]["embedding"]
                        elif "properties" in rel_copy and "embedding" in rel_copy["properties"]:
                            rel_copy["properties"] = rel_copy["properties"].copy()
                            del rel_copy["properties"]["embedding"]
                        print(f"Would create: {rel_copy['origen']} -[:{rel_copy['tipo']}]-> {rel_copy['destino']}")
                        continue
                    
                    result = create_relationship(driver, rel)
                    
                    if result.get("success", False):
                        rel_results["success"] += 1
                        print(f"✅ Created relationship: {rel['origen']} -[:{rel['tipo']}]-> {rel['destino']} (ID: {result['relId']})")
                    else:
                        rel_results["failed"] += 1
                        error_info = {
                            "original_id": result.get("original_id"),
                            "error": result.get("error"),
                            "relation": f"{rel['origen']} -[:{rel['tipo']}]-> {rel['destino']}"
                        }
                        rel_results["failures"].append(error_info)
                        print(f"❌ Failed to create relationship: {rel['origen']} -[:{rel['tipo']}]-> {rel['destino']}")
                        print(f"   Error: {result.get('error')}")
                
                print("\n📊 Relationship Import Summary:")
                print(f"  Total relationships: {len(relationships)}")
                print(f"  Successfully created: {rel_results['success']}")
                print(f"  Failed: {rel_results['failed']}")
                
                if rel_results["failed"] > 0:
                    print("\n❌ Failed relationships:")
                    for fail in rel_results["failures"]:
                        print(f"  {fail['relation']} - Error: {fail['error']}")
    
    # Clean up
    if driver:
        driver.close()

if __name__ == "__main__":
    main() 