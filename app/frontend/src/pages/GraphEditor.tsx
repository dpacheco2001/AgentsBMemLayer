import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from "sonner";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import GraphVisualization from '../components/GraphVisualization';
import NodeEditor from '../components/NodeEditor';
import RelationshipEditor from '../components/RelationshipEditor';
import StarryBackground from '../components/StarryBackground';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, Database, Plus, Trash, Edit, RefreshCw, X, Eye, EyeOff, Sliders } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Definición de tipos usando elementId para nodos
interface Node {
  elementId: string;
  labels?: string[];
  [key: string]: any;
}

interface Link {
  source: string;
  target: string;
  type: string;
  id: number;
  properties: Record<string, any>;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface VectorIndex {
  indexName: string;
  label: string;
  property: string;
  dimensions: number;
  similarityFunction: string;
}

const GraphEditor = () => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<Link | null>(null);
  const [nodeLabels, setNodeLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [sourceNode, setSourceNode] = useState<Node | null>(null);
  const [isCreateRelationshipDialogOpen, setIsCreateRelationshipDialogOpen] = useState(false);
  const [newRelationshipType, setNewRelationshipType] = useState('');
  const [labelColors, setLabelColors] = useState<Record<string, string>>({});
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('name');
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [showRelationshipLabels, setShowRelationshipLabels] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isCreating, setIsCreating] = useState(false); // Modo creación de nodo
  const [vectorIndexName, setVectorIndexName] = useState('');
  const [vectorLabel, setVectorLabel] = useState('');
  const [vectorDimensions, setVectorDimensions] = useState(1536);
  const [vectorSimilarity, setVectorSimilarity] = useState('cosine');
  const [vectorIndexes, setVectorIndexes] = useState<VectorIndex[]>([]);
  const [searchIndex, setSearchIndex] = useState('');
  const [nearestNeighbours, setNearestNeighbours] = useState(5);
  const [queryVector, setQueryVector] = useState('');
  const [vectorSearchResults, setVectorSearchResults] = useState<any[]>([]);

  // Paleta de colores para los labels
  const colorPalette = [
    '#9b87f5', '#F57DBD', '#7DF57D', '#F5D67D', '#7DD6F5', 
    '#D67DF5', '#F57D7D', '#7DF5D6', '#D6F57D', '#7D7DF5'
  ];

  // Fetch de datos del grafo desde el backend
  const fetchGraphData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:5001/api/graph-data');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as GraphData;
      setGraphData(data);
      
      // Extraer etiquetas únicas
      const labels = [...new Set(data.nodes
        .filter(node => node.labels && node.labels.length > 0)
        .flatMap(node => node.labels))];
      setNodeLabels(labels);
      
      // Asignar colores a los labels
      const colors: Record<string, string> = {};
      labels.forEach((label, index) => {
        colors[label] = colorPalette[index % colorPalette.length];
      });
      setLabelColors(colors);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching graph data:', error);
      toast.error('Failed to fetch graph data');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  // Filtrar nodos según criterio de búsqueda
  useEffect(() => {
    if (!filterText) {
      setFilteredNodes([]);
      return;
    }
    const searchValue = filterText.toLowerCase();
    const filtered = graphData.nodes.filter(node => {
      switch (filterType) {
        case 'id':
          return node.elementId.toLowerCase().includes(searchValue);
        case 'label':
          return node.labels && node.labels.some(label => label.toLowerCase().includes(searchValue));
        case 'property':
          return Object.entries(node).some(([key, value]) =>
            !['elementId', 'labels', 'x', 'y'].includes(key) &&
            String(value).toLowerCase().includes(searchValue)
          );
        case 'name':
        default:
          return (node.nombre || node.name || '').toString().toLowerCase().includes(searchValue);
      }
    });
    setFilteredNodes(filtered);
  }, [filterText, filterType, graphData.nodes]);

  // Generar embeddings para nodos de un label
  const generateEmbeddings = async (label: string) => {
    try {
      setIsLoading(true);
      toast.info(`Generating embeddings for nodes with label: ${label}`);
      const response = await fetch(`http://localhost:5001/api/generate_embedding/${label}`, { method: 'POST' });
      if (response.ok) {
        toast.success(`Embeddings generated for ${label} nodes`);
        fetchGraphData();
      } else {
        const errorData = await response.json();
        toast.error(`Failed to generate embeddings: ${errorData.error || 'Unknown error'}`);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      toast.error('Failed to generate embeddings: Network error');
      setIsLoading(false);
    }
  };

  const fetchVectorIndexes = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/vector-indexes');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setVectorIndexes(data.vector_indexes || []);
    } catch (error) {
      console.error('Error fetching vector indexes:', error);
      toast.error('Failed to fetch vector indexes');
    }
  };
  
  const createVectorIndex = async () => {
    if (!vectorIndexName || !vectorLabel || !vectorDimensions) {
      toast.error('Please provide index name, label and dimensions');
      return;
    }
    try {
      const payload = {
        indexName: vectorIndexName,
        label: vectorLabel,
        property: "embedding",
        dimensions: vectorDimensions,
        similarityFunction: vectorSimilarity
      };
      const response = await fetch('http://localhost:5001/api/vector-index/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.error) {
        toast.error(`Error creating vector index: ${result.error}`);
      } else {
        toast.success(`Vector index '${vectorIndexName}' created successfully`);
        fetchVectorIndexes();
      }
    } catch (error) {
      console.error('Error creating vector index:', error);
      toast.error('Failed to create vector index');
    }
  };
  
  const handleVectorSearch = async () => {
    if (!searchIndex || !nearestNeighbours || !queryVector) {
      toast.error('Please provide index, number of neighbours and query text');
      return;
    }
    try {
      const payload = {
        indexName: searchIndex,
        numberOfNearestNeighbours: nearestNeighbours,
        queryVector: queryVector // Enviar el texto directamente
      };
      
      const response = await fetch('http://localhost:5001/api/vector-search/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      if (result.error) {
        toast.error(`Vector search error: ${result.error}`);
      } else {
        setVectorSearchResults(result.results || []);
        toast.success('Vector search executed successfully');
      }
    } catch (error) {
      console.error('Error in vector search:', error);
      toast.error('Failed to perform vector search');
    }
  };
  // Ejecutar query personalizada
  const executeQuery = async (query: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:5001/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.error) {
        toast.error(`Query error: ${data.error}`);
      } else {
        toast.success('Query executed successfully');
        fetchGraphData();
      }
      setIsLoading(false);
      return data;
    } catch (error) {
      console.error('Error executing query:', error);
      toast.error('Failed to execute query');
      setIsLoading(false);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  // Handlers de selección y creación de relaciones
  const handleNodeSelect = (node: Node) => {
    if (connectionMode) {
      if (!sourceNode) {
        setSourceNode(node);
        toast.info(`Selected source node: ${node.nombre || node.name || `Node ${node.elementId}`}`);
      } else {
        setSelectedNode(node);
        setIsCreateRelationshipDialogOpen(true);
      }
    } else {
      // En modo edición, si se selecciona un nodo, se cierra el modo creación
      setSelectedNode(node);
      setSelectedRelationship(null);
      setIsCreating(false);
    }
  };

  const handleRelationshipSelect = (relationship: Link) => {
    if (!connectionMode) {
      setSelectedRelationship(relationship);
      setSelectedNode(null);
      setIsCreating(false);
    }
  };

  const handleDeleteNode = async (nodeElementId: string) => {
    if (!nodeElementId) return;
    try {
      const query = `MATCH (n) WHERE ID(n) = ${nodeElementId} DETACH DELETE n`;
      await executeQuery(query);
      setSelectedNode(null);
    } catch (error) {
      console.error('Error deleting node:', error);
      toast.error('Failed to delete node');
    }
  };

  const handleDeleteRelationship = async (relationshipId: number) => {
    if (!relationshipId) return;
    try {
      const relationshipElementId = String(relationshipId);
      const parts = relationshipElementId.split(":");
      const relationshipIdParsed = parts[parts.length - 1];
      const query = `MATCH ()-[r]->() WHERE ID(r) = ${relationshipIdParsed} DELETE r`;
      await executeQuery(query);
      setSelectedRelationship(null);
    } catch (error) {
      console.error('Error deleting relationship:', error);
      toast.error('Failed to delete relationship');
    }
  };

  const handleCreateRelationship = async () => {
    if (!sourceNode || !selectedNode || !newRelationshipType) {
      toast.error('Missing information for creating relationship');
      return;
    }
    try {
      const query = `
        MATCH (a), (b) 
        WHERE ID(a) = ${sourceNode.elementId} AND ID(b) = ${selectedNode.elementId} 
        CREATE (a)-[r:${newRelationshipType}]->(b) 
        RETURN r
      `;
      await executeQuery(query);
      toast.success(`Created relationship ${newRelationshipType}`);
      setIsCreateRelationshipDialogOpen(false);
      setConnectionMode(false);
      setSourceNode(null);
      setNewRelationshipType('');
      await fetchGraphData();
    } catch (error) {
      console.error('Error creating relationship:', error);
      toast.error('Failed to create relationship');
    }
  };

  const cancelConnectionMode = () => {
    setConnectionMode(false);
    setSourceNode(null);
    setIsCreateRelationshipDialogOpen(false);
    setNewRelationshipType('');
  };

  // Para crear un nuevo nodo, usamos el estado isCreating


  return (
    <div className="flex flex-col min-h-screen bg-brain-dark overflow-hidden relative">
      <StarryBackground />
      <header className="px-6 py-4 border-b border-brain-secondary backdrop-blur-md z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold text-white">Neo4j Graph Editor</h1>
          <div className="flex gap-2">
            <Link to="/">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Home size={16} />
                <span>Brain View</span>
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fetchGraphData}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </Button>
            <Popover open={showSettings} onOpenChange={setShowSettings}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Sliders size={16} />
                  <span>Settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 bg-secondary/95 border-brain-secondary backdrop-blur-md">
                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Display Options</h3>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-labels">Show Relationship Labels</Label>
                    <Switch 
                      id="show-labels" 
                      checked={showRelationshipLabels} 
                      onCheckedChange={setShowRelationshipLabels}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-150 border-r border-brain-secondary bg-secondary/30 backdrop-blur-sm p-4 z-10 overflow-y-auto">
          <Tabs defaultValue="nodeLabels">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="nodeLabels" className="flex-1">Labels</TabsTrigger>
              <TabsTrigger value="actions" className="flex-1">Actions</TabsTrigger>
              <TabsTrigger value="filter" className="flex-1">Filter</TabsTrigger>
              <TabsTrigger value="vectorSearch" className="flex-1">Vector Search</TabsTrigger>
            </TabsList>
            
            <TabsContent value="nodeLabels" className="space-y-4">
              <h2 className="text-lg font-medium text-white mb-2">Node Labels</h2>
              <div className="space-y-2">
                {nodeLabels.map((label) => (
                  <div key={label} className="flex justify-between items-center p-2 bg-secondary/60 rounded-md">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: labelColors[label] || '#9b87f5' }}
                      />
                      <span className="text-white">{label}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateEmbeddings(label)}
                      disabled={isLoading}
                      className="transition-all hover:bg-primary hover:text-white"
                    >
                      Generate Embeddings
                    </Button>
                  </div>
                ))}
                {nodeLabels.length === 0 && (
                  <p className="text-muted-foreground text-sm">No labels found</p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="actions" className="space-y-4">
              <h2 className="text-lg font-medium text-white mb-2">Actions</h2>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedNode(null);
                    setSelectedRelationship(null);
                    setIsCreating(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Node
                </Button>
                <Button 
                  variant={connectionMode ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => {
                    setConnectionMode(!connectionMode);
                    if (!connectionMode) {
                      toast.info("Click on source node, then target node to create a relationship");
                      setSelectedNode(null);
                      setSelectedRelationship(null);
                    } else {
                      setSourceNode(null);
                    }
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {connectionMode ? "Cancel Relationship Mode" : "Create Relationship"}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="filter" className="space-y-4">
              <h2 className="text-lg font-medium text-white mb-2">Filter Nodes</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Label htmlFor="filter-type" className="self-center">Filter by:</Label>
                  <div className="col-span-2">
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger id="filter-type">
                        <SelectValue placeholder="Filter type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="id">ID</SelectItem>
                        <SelectItem value="label">Label</SelectItem>
                        <SelectItem value="property">Property</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Input
                  placeholder={`Search by ${filterType}...`}
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                {filterText && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-white">Results ({filteredNodes.length})</h3>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredNodes.length > 0 ? filteredNodes.map(node => (
                        <Button 
                          key={node.elementId} 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => {
                            setSelectedNode(node);
                            setFilterText('');
                            setIsCreating(false);
                          }}
                        >
                          {node.nombre || node.name || `Node ${node.elementId}`}
                        </Button>
                      )) : (
                        <p className="text-muted-foreground text-sm">No matches found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            
            <TabsContent value="vectorSearch" className="space-y-4">
              <h2 className="text-lg font-medium text-white mb-2">Search by Embeddings</h2>
              
              {/* Formulario para crear un índice vectorial */}
              <div className="border p-4 rounded-md space-y-2">
                <h3 className="text-md font-medium text-white">Create Node Vector Index</h3>
                <Input
                  value={vectorIndexName}
                  onChange={(e) => setVectorIndexName(e.target.value)}
                  placeholder="Index Name (e.g., moviePlots)"
                />
                <Select value={vectorLabel} onValueChange={setVectorLabel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Label" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodeLabels.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={vectorDimensions}
                  onChange={(e) => setVectorDimensions(Number(e.target.value))}
                  placeholder="Dimensions (e.g., 1536)"
                />
                <Select value={vectorSimilarity} onValueChange={setVectorSimilarity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Similarity Function" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cosine">Cosine</SelectItem>
                    <SelectItem value="euclidean">Euclidean</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={createVectorIndex} variant="outline" className="w-full">
                  Create Index
                </Button>
              </div>
              
              {/* Lista de índices activos */}
              <div className="border p-4 rounded-md space-y-2">
                <h3 className="text-md font-medium text-white">Active Vector Indexes</h3>
                <Button onClick={fetchVectorIndexes} variant="outline" size="sm">
                  Refresh Indexes
                </Button>
                {vectorIndexes.length > 0 ? (
                  <ul className="text-white text-sm">
                    {vectorIndexes.map((idx) => (
                      <li key={idx.indexName}>
                        {idx.indexName} - {idx.label} - {idx.dimensions} dims - {idx.similarityFunction}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">No vector indexes found.</p>
                )}
              </div>
              
              {/* Formulario para búsqueda vectorial */}
              <div className="border p-4 rounded-md space-y-2">
                <h3 className="text-md font-medium text-white">Vector Search</h3>
                <Select value={searchIndex} onValueChange={setSearchIndex}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Index" />
                  </SelectTrigger>
                  <SelectContent>
                    {vectorIndexes.map((idx) => (
                      <SelectItem key={idx.indexName} value={idx.indexName}>
                        {idx.indexName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={nearestNeighbours}
                  onChange={(e) => setNearestNeighbours(Number(e.target.value))}
                  placeholder="Number of Nearest Neighbours"
                />
                <Input
                  value={queryVector}
                  onChange={(e) => setQueryVector(e.target.value)}
                  placeholder='Enter search text (e.g., Who am I?)'
                />
                <Button onClick={handleVectorSearch} variant="outline" className="w-full">
                  Search
                </Button>
                {vectorSearchResults.length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-white text-sm font-medium">Results:</h4>
                    <ul className="text-white text-xs space-y-1">
                      {vectorSearchResults.map((item, i) => {
                        const properties = item.node || {};
                        return (
                          <li key={i} className="bg-secondary/20 p-2 rounded-md">
                            <div className="flex justify-between">
                              <span className="font-medium">
                                {`Node '${item.node.nombre}'`}
                              </span>
                              <Badge variant="outline" className="ml-2">
                                Score: {item.score.toFixed(3)}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground mt-1">
                              {Object.entries(properties)
                                .filter(([key]) => !['embedding'].includes(key))
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span> {String(value)}
                                  </div>
                                ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          {connectionMode && sourceNode && (
            <div className="mt-4 border border-brain-secondary rounded-md p-3 bg-secondary/40 relative">
              <Button 
                variant="ghost" 
                size="icon"
                className="absolute top-2 right-2" 
                onClick={cancelConnectionMode}
              >
                <X size={16} />
              </Button>
              <h3 className="text-white font-medium mb-2">Creating Relationship</h3>
              <p className="text-sm text-muted-foreground">
                From: {sourceNode?.nombre || sourceNode?.name || `Node ${sourceNode?.elementId}`}
              </p>
              <p className="text-sm text-muted-foreground">To: Click on a target node</p>
            </div>
          )}
          
          {(isCreating || selectedNode) && !connectionMode && (
            <div className="mt-6 border-t border-brain-secondary pt-4">
              <h2 className="text-lg font-medium text-white mb-4 flex justify-between">
                <span>Node Properties</span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleDeleteNode(selectedNode ? selectedNode.elementId : '')}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </h2>
              <NodeEditor 
                node={selectedNode} 
                graphData={graphData}
                executeQuery={executeQuery}
                onClose={() => {
                  setSelectedNode(null);
                  setIsCreating(false);
                }}
              />
            </div>
          )}
          
          {selectedRelationship && (
            <div className="mt-6 border-t border-brain-secondary pt-4">
              <h2 className="text-lg font-medium text-white mb-4 flex justify-between">
                <span>Relationship Properties</span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleDeleteRelationship(selectedRelationship.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </h2>
              <RelationshipEditor 
                relationship={selectedRelationship}
                executeQuery={executeQuery}
                onClose={() => setSelectedRelationship(null)}
              />
            </div>
          )}
        </aside>
        
        <main className="flex-1 overflow-hidden z-10">
          <GraphVisualization 
            graphData={graphData}
            onNodeSelect={handleNodeSelect}
            onRelationshipSelect={handleRelationshipSelect}
            selectedNodeId={selectedNode?.elementId}
            selectedRelationshipId={selectedRelationship?.id}
            connectionMode={connectionMode}
            sourceNodeId={sourceNode?.elementId}
            labelColors={labelColors}
            showRelationshipLabels={showRelationshipLabels}
            highlightedNodeIds={filteredNodes.length > 0 ? filteredNodes.map(node => node.elementId) : null}
          />
        </main>
      </div>
      
      <Dialog 
        open={isCreateRelationshipDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateRelationshipDialogOpen(false);
            if (connectionMode) {
              setSourceNode(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Relationship</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fromNode" className="text-right">
                From
              </Label>
              <div className="col-span-3 text-sm">
                {sourceNode?.nombre || sourceNode?.name || `Node ${sourceNode?.elementId}`}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="toNode" className="text-right">
                To
              </Label>
              <div className="col-span-3 text-sm">
                {selectedNode?.nombre || selectedNode?.name || `Node ${selectedNode?.elementId}`}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="relType" className="text-right">
                Type
              </Label>
              <Input
                id="relType"
                placeholder="RELATIONSHIP_TYPE"
                className="col-span-3"
                value={newRelationshipType}
                onChange={(e) => setNewRelationshipType(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateRelationshipDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!newRelationshipType} 
              onClick={handleCreateRelationship}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GraphEditor;
