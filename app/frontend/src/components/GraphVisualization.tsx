import React, { useEffect, useRef, useState } from "react";
import { Move, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Puedes quitar estos si no los usas
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";

interface Node {
  elementId: string;
  labels?: string[];
  nombre?: string;
  name?: string;
  embedding?: unknown;
  [key: string]: unknown;
}

interface Link {
  source: string; // Ahora se usan elementId (string)
  target: string;
  type: string;
  id: number;
  properties: Record<string, unknown>;
  [key: string]: unknown;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface GraphVisualizationProps {
  graphData: GraphData;
  onNodeSelect: (node: Node) => void;
  onRelationshipSelect: (relationship: Link) => void;
  selectedNodeId?: string | null;
  selectedRelationshipId?: number | null;
  connectionMode?: boolean;
  sourceNodeId?: string | null;
  labelColors?: Record<string, string>;
  showRelationshipLabels?: boolean;
  highlightedNodeIds?: string[] | null;
  executeQuery?: (query: string) => Promise<Record<string, unknown>>;
}

/**
 * Calcula centros fijos para cada label, dispuestos en un círculo
 * alrededor del centro del canvas.
 */
function getClusterCenters(labels: string[], width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4; // Aumentado de 0.3 a 0.4 para mayor separación
  const angleStep = (2 * Math.PI) / labels.length;

  const centers: Record<string, { x: number; y: number }> = {};
  labels.forEach((label, i) => {
    const angle = i * angleStep;
    centers[label] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
  return centers;
}

/**
 * Posiciona cada nodo cerca del centro fijo de su label,
 * con un algoritmo que evita superposiciones entre nodos.
 */
function clusterLayout(nodes: Node[], width: number, height: number) {
  // Identificar etiquetas únicas
  const labelSet = new Set<string>();
  nodes.forEach((n) => {
    if (n.labels) {
      n.labels.forEach((l) => labelSet.add(l));
    }
  });
  const uniqueLabels = Array.from(labelSet);

  // Si no hay etiquetas, usar un layout radial simple
  if (uniqueLabels.length === 0) {
    return createRadialLayout(nodes, width, height);
  }

  // Obtener los centros para cada grupo de etiquetas
  const centers = getClusterCenters(uniqueLabels, width, height);

  // Agrupar nodos por etiqueta
  const nodesByLabel: Record<string, Node[]> = {};
  uniqueLabels.forEach((label) => {
    nodesByLabel[label] = [];
  });

  nodes.forEach((node) => {
    const label = node.labels?.[0] || "default";
    if (nodesByLabel[label]) {
      nodesByLabel[label].push(node);
    } else {
      nodesByLabel["default"] = nodesByLabel["default"] || [];
      nodesByLabel["default"].push(node);
    }
  });

  // Crear posiciones iniciales para todos los nodos
  const positions: Record<string, { x: number; y: number }> = {};

  // Para cada grupo de etiquetas, distribuir los nodos en forma de círculo o espiral
  Object.entries(nodesByLabel).forEach(([label, groupNodes]) => {
    if (groupNodes.length === 0) return;

    const center = centers[label] || { x: width / 2, y: height / 2 };

    // Calcular radio para la distribución
    const nodeRadius = 25; // Radio del nodo (incluyendo margen)
    const minRadius = nodeRadius * 2;

    if (groupNodes.length === 1) {
      // Si solo hay un nodo, ponerlo en el centro del grupo
      positions[groupNodes[0].elementId] = { x: center.x, y: center.y };
    } else {
      // Distribuir los nodos en círculo o espiral
      const angleStep = (2 * Math.PI) / groupNodes.length;

      // Aumentar el radio según la cantidad de nodos
      const circleRadius = Math.max(
        minRadius * 2,
        minRadius + groupNodes.length * 4
      );

      groupNodes.forEach((node, i) => {
        const angle = i * angleStep;
        // Añadir variación para evitar patrones demasiado regulares
        const r = circleRadius + Math.random() * nodeRadius * 0.8;
        positions[node.elementId] = {
          x: center.x + r * Math.cos(angle),
          y: center.y + r * Math.sin(angle),
        };
      });
    }
  });

  return positions;
}

/**
 * Crea un layout radial para cuando no hay etiquetas definidas
 */
function createRadialLayout(nodes: Node[], width: number, height: number) {
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = width / 2;
  const centerY = height / 2;

  if (nodes.length === 1) {
    positions[nodes[0].elementId] = { x: centerX, y: centerY };
    return positions;
  }

  const radiusBase = Math.min(width, height) * 0.35;
  const angleStep = (2 * Math.PI) / nodes.length;

  nodes.forEach((node, i) => {
    const angle = i * angleStep;
    // Añadir variación al radio para evitar una forma perfectamente circular
    const radius = radiusBase * (0.9 + Math.random() * 0.2);
    positions[node.elementId] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  return positions;
}

const GraphVisualization: React.FC<GraphVisualizationProps> = ({
  graphData,
  onNodeSelect,
  onRelationshipSelect,
  selectedNodeId,
  selectedRelationshipId,
  connectionMode = false,
  sourceNodeId = null,
  labelColors = {},
  showRelationshipLabels = true,
  highlightedNodeIds = null,
  executeQuery,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Estados para pan y zoom
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Posiciones de los nodos calculadas por cluster layout (clave: elementId)
  const [nodePositions, setNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Referencia para las posiciones personalizada de los nodos
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Drag y hover, usando elementId
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<number | null>(null);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);

  const highlightNodeMapRef = useRef<Map<string, boolean>>(new Map());
  const highlightLinkMapRef = useRef<Map<number, boolean>>(new Map());

  const [nodesToRender, setNodesToRender] = useState<Node[]>([]);
  const [linksToRender, setLinksToRender] = useState<Link[]>([]);

  useEffect(() => {
    const nodes = [...graphData.nodes];
    const links = [...graphData.links];
    const nodeHighlightMap = new Map<string, boolean>();
    const linkHighlightMap = new Map<number, boolean>();

    if (highlightedNodeIds && highlightedNodeIds.length > 0) {
      graphData.nodes.forEach((node) => {
        nodeHighlightMap.set(
          node.elementId,
          highlightedNodeIds.includes(node.elementId)
        );
      });
      graphData.links.forEach((link) => {
        linkHighlightMap.set(
          link.id,
          highlightedNodeIds.includes(link.source) &&
            highlightedNodeIds.includes(link.target)
        );
      });
    }

    setNodesToRender(nodes);
    setLinksToRender(links);
    highlightNodeMapRef.current = nodeHighlightMap;
    highlightLinkMapRef.current = linkHighlightMap;
  }, [graphData.nodes, graphData.links, highlightedNodeIds]);

  useEffect(() => {
    if (nodesToRender.length === 0) return;

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;

    // Solo calcular layout para nodos que no tienen posición guardada
    const nodosNuevos = nodesToRender.filter(
      (node) => !positionsRef.current[node.elementId]
    );

    if (nodosNuevos.length > 0) {
      // Solo calcular nuevas posiciones para los nodos nuevos
      const newPositionsForNewNodes = clusterLayout(nodosNuevos, width, height);

      // Combinar posiciones existentes con las nuevas
      setNodePositions((prev) => {
        const combinedPositions = { ...prev, ...newPositionsForNewNodes };
        // Actualizar la referencia permanente
        positionsRef.current = combinedPositions;
        return combinedPositions;
      });
    } else if (Object.keys(nodePositions).length === 0) {
      // Inicialización primera vez - solo si no hay posiciones todavía
      const initialPositions = clusterLayout(nodesToRender, width, height);
      setNodePositions(initialPositions);
      positionsRef.current = initialPositions;
    }
  }, [nodesToRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Dibujar relaciones (edges)
    linksToRender.forEach((link) => {
      const sourcePos = nodePositions[link.source];
      const targetPos = nodePositions[link.target];
      if (!sourcePos || !targetPos) return;
      ctx.beginPath();
      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const angle = Math.atan2(dy, dx);
      const nodeRadius = 20;
      const startX = sourcePos.x + Math.cos(angle) * nodeRadius;
      const startY = sourcePos.y + Math.sin(angle) * nodeRadius;
      const endX = targetPos.x - Math.cos(angle) * nodeRadius;
      const endY = targetPos.y - Math.sin(angle) * nodeRadius;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);

      if (link.id === selectedRelationshipId) {
        ctx.strokeStyle = "#ff5733";
        ctx.lineWidth = 3;
      } else if (link.id === hoveredLinkId) {
        ctx.strokeStyle = "#33ccff";
        ctx.lineWidth = 2;
      } else if (
        highlightLinkMapRef.current.has(link.id) &&
        !highlightLinkMapRef.current.get(link.id)
      ) {
        ctx.strokeStyle = "rgba(155, 135, 245, 0.2)";
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = "#9b87f5";
        ctx.lineWidth = 1.5;
      }
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(angle - arrowAngle),
        endY - arrowLength * Math.sin(angle - arrowAngle)
      );
      ctx.lineTo(
        endX - arrowLength * Math.cos(angle + arrowAngle),
        endY - arrowLength * Math.sin(angle + arrowAngle)
      );
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();

      if (showRelationshipLabels) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        let displayText = link.type;
        if (displayText.length > 15) {
          displayText = displayText.substring(0, 12) + "...";
        }
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textMetrics = ctx.measureText(displayText);
        const textWidth = textMetrics.width;
        const textHeight = 16;
        ctx.fillStyle = "rgba(30, 30, 46, 0.7)";
        ctx.fillRect(
          midX - textWidth / 2 - 4,
          midY - textHeight / 2,
          textWidth + 8,
          textHeight
        );
        ctx.fillStyle = "#fff";
        ctx.fillText(displayText, midX, midY);
      }
    });

    // Dibujar nodos
    nodesToRender.forEach((node) => {
      const pos = nodePositions[node.elementId];
      if (!pos) return;
      const isHovered = node.elementId === hoveredNodeId;
      const isSelected = node.elementId === selectedNodeId;
      const isSourceNode = node.elementId === sourceNodeId && connectionMode;
      if (isHovered || isSelected || isSourceNode) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 24, 0, 2 * Math.PI);
        if (isSelected) {
          ctx.fillStyle = "rgba(255, 87, 51, 0.3)";
        } else if (isSourceNode) {
          ctx.fillStyle = "rgba(51, 255, 87, 0.3)";
        } else {
          ctx.fillStyle = "rgba(51, 153, 255, 0.3)";
        }
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
      let nodeColor = "#8B5CF6";
      if (node.labels && node.labels.length && labelColors[node.labels[0]]) {
        nodeColor = labelColors[node.labels[0]];
      }
      const isDimmed =
        highlightNodeMapRef.current.has(node.elementId) &&
        !highlightNodeMapRef.current.get(node.elementId);
      if (isSelected) {
        ctx.fillStyle = brightenColor(nodeColor, 40);
      } else if (isSourceNode) {
        ctx.fillStyle = "#33ff57";
      } else if (draggedNodeId === node.elementId) {
        ctx.fillStyle = brightenColor(nodeColor, 20);
      } else if (isHovered) {
        ctx.fillStyle = brightenColor(nodeColor, 25);
      } else if (isDimmed) {
        ctx.fillStyle = transparentColor(nodeColor, 0.2);
      } else {
        ctx.fillStyle = nodeColor;
      }
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (isHovered && !isSelected && !isSourceNode) {
        ctx.beginPath();
        const pulseRadius = 22 + Math.sin(Date.now() / 200) * 2;
        ctx.arc(pos.x, pos.y, pulseRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = brightenColor(nodeColor, 25);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let label =
        (node.nombre as string) ||
        (node.name as string) ||
        `Node ${node.elementId}`;
      if (typeof label === "string" && label.length > 15) {
        label = label.substring(0, 12) + "...";
      }
      ctx.fillText(String(label), pos.x, pos.y);
      if (node.labels && node.labels.length) {
        ctx.font = "10px Arial";
        ctx.fillStyle = "#d6bcfa";
        const labelText = node.labels.join(":");
        const labelFinal =
          labelText.length > 20
            ? labelText.substring(0, 17) + "..."
            : labelText;
        ctx.fillText(labelFinal, pos.x, pos.y - 25);
      }
      if (
        connectionMode &&
        node.elementId !== sourceNodeId &&
        node.elementId === hoveredNodeId
      ) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 22, 0, 2 * Math.PI);
        ctx.strokeStyle = "#33ff57";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    if (
      connectionMode &&
      sourceNodeId !== null &&
      hoveredNodeId !== null &&
      sourceNodeId !== hoveredNodeId
    ) {
      const sourcePos = nodePositions[sourceNodeId];
      const targetPos = nodePositions[hoveredNodeId];
      if (sourcePos && targetPos) {
        ctx.beginPath();
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.strokeStyle = "#33ff57";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }, [
    nodesToRender,
    linksToRender,
    nodePositions,
    offset,
    zoom,
    selectedNodeId,
    selectedRelationshipId,
    hoveredNodeId,
    hoveredLinkId,
    draggedNodeId,
    connectionMode,
    sourceNodeId,
    labelColors,
    showRelationshipLabels,
  ]);

  const brightenColor = (color: string, increment: number) => {
    try {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const nr = Math.min(255, r + increment);
      const ng = Math.min(255, g + increment);
      const nb = Math.min(255, b + increment);
      return `#${nr.toString(16).padStart(2, "0")}${ng
        .toString(16)
        .padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
    } catch (err) {
      return color;
    }
  };

  const transparentColor = (color: string, alpha: number) => {
    try {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } catch (err) {
      return `rgba(139, 92, 246, ${alpha})`;
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const findElementAtPosition = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { clickedNode: null, clickedRelationship: null };
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let clickedNode: Node | null = null;
    for (const node of nodesToRender) {
      const pos = nodePositions[node.elementId];
      if (!pos) continue;
      const adjustedX = pos.x * zoom + offset.x;
      const adjustedY = pos.y * zoom + offset.y;
      const dx = x - adjustedX;
      const dy = y - adjustedY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 20 * zoom) {
        clickedNode = node;
        break;
      }
    }
    let clickedRelationship: Link | null = null;
    if (!clickedNode) {
      for (const link of linksToRender) {
        const sourcePos = nodePositions[link.source];
        const targetPos = nodePositions[link.target];
        if (!sourcePos || !targetPos) continue;
        const sX = sourcePos.x * zoom + offset.x;
        const sY = sourcePos.y * zoom + offset.y;
        const tX = targetPos.x * zoom + offset.x;
        const tY = targetPos.y * zoom + offset.y;
        const lineLen = Math.sqrt((tX - sX) ** 2 + (tY - sY) ** 2);
        if (lineLen === 0) continue;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - sX) * (tX - sX) + (y - sY) * (tY - sY)) / (lineLen * lineLen)
          )
        );
        const projX = sX + t * (tX - sX);
        const projY = sY + t * (tY - sY);
        const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
        if (dist <= 8) {
          clickedRelationship = link;
          break;
        }
      }
    }
    return { clickedNode, clickedRelationship };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { clickedNode, clickedRelationship } = findElementAtPosition(
      e.clientX,
      e.clientY
    );
    if (connectionMode && clickedNode) {
      if (sourceNodeId === null) {
        onNodeSelect(clickedNode);
      } else if (clickedNode.elementId !== sourceNodeId) {
        onNodeSelect(clickedNode);
      }
    } else if (clickedNode) {
      onNodeSelect(clickedNode);
      setDraggedNodeId(clickedNode.elementId);
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (clickedRelationship) {
      onRelationshipSelect(clickedRelationship);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { clickedNode, clickedRelationship } = findElementAtPosition(
      e.clientX,
      e.clientY
    );
    setHoveredNodeId(clickedNode?.elementId || null);
    setHoveredLinkId(clickedRelationship?.id || null);

    if (!isDragging) return;

    if (draggedNodeId !== null) {
      const deltaX = (e.clientX - dragStart.x) / zoom;
      const deltaY = (e.clientY - dragStart.y) / zoom;
      setNodePositions((prev) => {
        const updated = {
          ...prev,
          [draggedNodeId]: {
            x: prev[draggedNodeId].x + deltaX,
            y: prev[draggedNodeId].y + deltaY,
          },
        };
        // Actualizar también la referencia permanente
        positionsRef.current = updated;
        return updated;
      });
      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      setOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
    setHoveredNodeId(null);
    setHoveredLinkId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    const delta = e.deltaY < 0 ? zoomFactor : -zoomFactor;
    const newZoom = Math.max(0.1, Math.min(2, zoom + delta));

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newOffset = {
      x: mouseX - (mouseX - offset.x) * (newZoom / zoom),
      y: mouseY - (mouseY - offset.y) * (newZoom / zoom),
    };
    setZoom(newZoom);
    setOffset(newOffset);
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(2, zoom + 0.1);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.1, zoom - 0.1);
    setZoom(newZoom);
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Función para generar un ID único para el nuevo nodo
  const generateUniqueId = () => {
    return `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  // Función para manejar la copia de un nodo
  const handleCopyNode = (elementId: string) => {
    const nodeToCopy = nodesToRender.find(
      (node) => node.elementId === elementId
    );
    if (nodeToCopy) {
      setCopiedNode(nodeToCopy);
      toast.success("Node copied to clipboard");
    }
  };

  // Función para pegar un nodo copiado
  const handlePasteNode = async () => {
    if (!copiedNode || !executeQuery) return;

    try {
      // Creamos una copia de las propiedades del nodo original
      const nodeProperties = { ...copiedNode };

      // Eliminamos propiedades que no queremos copiar
      delete nodeProperties.elementId;
      delete nodeProperties.x;
      delete nodeProperties.y;
      delete nodeProperties.embedding; // No copiamos el embedding

      // Preparamos los datos para el nuevo nodo
      const newNode: Node = {
        elementId: generateUniqueId(),
        ...nodeProperties,
      };

      // Obtenemos la lista de relaciones asociadas al nodo original
      const relatedLinks = linksToRender.filter(
        (link) =>
          link.source === copiedNode.elementId ||
          link.target === copiedNode.elementId
      );

      // Crear el nodo en la base de datos usando el executeQuery
      const payload = {
        labels: copiedNode.labels || [],
        properties: Object.entries(nodeProperties)
          .filter(([key]) => !["labels"].includes(key))
          .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {} as Record<string, unknown>),
      };

      // Crear el nodo mediante la API
      const res = await fetch("http://localhost:5001/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.error) {
        toast.error(`Error creating node: ${result.error}`);
        return;
      }

      const newNodeId = result.elementId || newNode.elementId;

      // Posicionamos el nuevo nodo cerca del nodo original
      const offsetX = 50 + Math.random() * 30;
      const offsetY = 50 + Math.random() * 30;

      if (nodePositions[copiedNode.elementId]) {
        setNodePositions((prev) => ({
          ...prev,
          [newNodeId]: {
            x: nodePositions[copiedNode.elementId].x + offsetX,
            y: nodePositions[copiedNode.elementId].y + offsetY,
          },
        }));

        // Actualizar también la referencia permanente
        positionsRef.current = {
          ...positionsRef.current,
          [newNodeId]: {
            x: nodePositions[copiedNode.elementId].x + offsetX,
            y: nodePositions[copiedNode.elementId].y + offsetY,
          },
        };
      }

      // Crear las mismas relaciones para el nuevo nodo
      for (const link of relatedLinks) {
        const isSource = link.source === copiedNode.elementId;
        const relationshipPayload = {
          source: isSource ? newNodeId : link.source,
          target: isSource ? link.target : newNodeId,
          type: link.type,
          properties: link.properties || {},
        };

        await fetch("http://localhost:5001/api/relationships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(relationshipPayload),
        });
      }

      toast.success("Node pasted successfully");
    } catch (error) {
      console.error("Error pasting node:", error);
      toast.error("Failed to paste node");
    }
  };

  // Manejador de eventos de teclado para copiar/pegar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si está en modo de edición (input, textarea, etc.) no procesamos los atajos
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Copiar nodo (Ctrl+C)
      if (e.ctrlKey && e.key === "c" && selectedNodeId) {
        e.preventDefault();
        handleCopyNode(selectedNodeId);
      }

      // Pegar nodo (Ctrl+V)
      if (e.ctrlKey && e.key === "v" && copiedNode) {
        e.preventDefault();
        handlePasteNode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNodeId, copiedNode]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } ${connectionMode && sourceNodeId !== null ? "cursor-crosshair" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        tabIndex={0}
      />
      <div className="absolute bottom-4 right-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={handleReset}>
          <Move className="h-4 w-4" />
        </Button>
      </div>
      {connectionMode && sourceNodeId !== null && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-secondary/90 py-2 px-4 rounded-full text-white text-sm animate-pulse">
          Click on a target node to create a relationship
        </div>
      )}
      {hoveredNodeId !== null && (
        <div className="absolute bottom-4 left-4 bg-secondary/70 backdrop-blur-sm py-2 px-4 rounded text-white text-sm max-w-xs">
          {(() => {
            const node = nodesToRender.find(
              (n) => n.elementId === hoveredNodeId
            );
            if (!node) return null;
            const name =
              (node.nombre as string) ||
              (node.name as string) ||
              `Node ${node.elementId}`;
            const labels =
              node.labels && node.labels.length > 0
                ? `(${node.labels.join(":")})`
                : "";
            return (
              <div className="flex flex-col gap-1">
                <div className="font-medium">
                  {name} {labels}
                </div>
                <div className="text-xs text-gray-300">
                  ID: {node.elementId}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default GraphVisualization;
