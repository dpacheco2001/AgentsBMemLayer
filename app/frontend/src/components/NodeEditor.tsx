import React, { useState, useEffect } from 'react';
import { toast } from "sonner";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash, Plus, Save } from 'lucide-react';

interface Node {
  elementId: string;
  [key: string]: any;
}

interface GraphData {
  nodes: Node[];
  links: any[];
}

interface NodeEditorProps {
  node: Node | null;
  graphData: GraphData;
  executeQuery: (query: string) => Promise<any>;
  onClose: () => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ 
  node, 
  graphData, 
  executeQuery,
  onClose 
}) => {
  const [properties, setProperties] = useState<{ key: string, value: string }[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [isNew, setIsNew] = useState(false);

  // (Opcional) Sección para crear relaciones
  const [targetNodeId, setTargetNodeId] = useState('');
  const [relationshipType, setRelationshipType] = useState('');

  // Inicializar propiedades y etiquetas al cambiar el nodo
  useEffect(() => {
    if (!node) {
      setProperties([]);
      setLabels([]);
      setIsNew(true);
      return;
    }
    setIsNew(false);
    const props = Object.entries(node)
      .filter(([key]) => !['elementId', 'labels', 'x', 'y'].includes(key))
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value)
      }));
    setProperties(props);
    setLabels(node.labels || []);
  }, [node]);

  const handleAddProperty = () => {
    if (!newPropertyKey.trim()) {
      toast.error('Property key cannot be empty');
      return;
    }
    if (properties.some(p => p.key === newPropertyKey)) {
      toast.error('Property already exists');
      return;
    }
    setProperties([...properties, { key: newPropertyKey, value: newPropertyValue }]);
    setNewPropertyKey('');
    setNewPropertyValue('');
  };

  const handleUpdateProperty = (index: number, key: string, value: string) => {
    const updatedProperties = [...properties];
    updatedProperties[index] = { key, value };
    setProperties(updatedProperties);
  };

  const handleRemoveProperty = (index: number) => {
    if (node) {
      const propKey = properties[index].key;
      fetch(`http://localhost:5001/api/nodes/${node.elementId}/properties/${propKey}`, {
        method: 'DELETE'
      })
        .then(res => res.json())
        .then(data => {
          toast.success('Property deleted successfully');
        })
        .catch(err => {
          console.error(err);
          toast.error('Failed to delete property');
        });
    }
    setProperties(properties.filter((_, i) => i !== index));
  };

  const handleAddLabel = () => {
    if (!newLabel.trim()) {
      toast.error('Label cannot be empty');
      return;
    }
    if (labels.includes(newLabel)) {
      toast.error('Label already exists');
      return;
    }
    setLabels([...labels, newLabel.trim()]);
    setNewLabel('');
  };

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter(l => l !== label));
  };

  // Guardar nodo (crear o actualizar) mediante los endpoints REST
  const handleSave = async () => {
    try {
      // Limpiar etiquetas vacías
      const cleanedLabels = labels.filter(l => l.trim() !== '');
      if (isNew) {
        const payload = {
          labels: cleanedLabels,
          properties: properties.reduce((acc, prop) => {
            acc[prop.key] = prop.value;
            return acc;
          }, {} as Record<string, string>)
        };
        const res = await fetch('http://localhost:5001/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.error) {
          toast.error(`Error saving node: ${result.error}`);
        } else {
          toast.success('Node created successfully');
          onClose();
        }
      } else if (node) {
        const payload = {
          labels: cleanedLabels,
          properties: properties.reduce((acc, prop) => {
            acc[prop.key] = prop.value;
            return acc;
          }, {} as Record<string, string>)
        };
        const res = await fetch(`http://localhost:5001/api/nodes/${node.elementId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.error) {
          toast.error(`Error updating node: ${result.error}`);
        } else {
          toast.success('Node updated successfully');
          onClose();
        }
      }
    } catch (error) {
      console.error('Error saving node:', error);
      toast.error('Failed to save node');
    }
  };

  // (Opcional) Crear relación mediante endpoint POST /api/relationships
  const handleCreateRelationship = async () => {
    if (!node) return;
    if (!targetNodeId || !relationshipType) {
      toast.error('Target node and relationship type are required');
      return;
    }
    try {
      const payload = {
        source: node.elementId,
        target: targetNodeId,
        type: relationshipType
      };
      const res = await fetch('http://localhost:5001/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.error) {
        toast.error(`Error creating relationship: ${result.error}`);
      } else {
        toast.success('Relationship created successfully');
        setTargetNodeId('');
        setRelationshipType('');
      }
    } catch (error) {
      console.error('Error creating relationship:', error);
      toast.error('Failed to create relationship');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sección de Labels */}
      <div className="space-y-2">
        <h3 className="text-md font-medium text-white">Labels</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          {labels.map(label => (
            <div key={label} className="flex items-center bg-brain-secondary px-2 py-1 rounded-md">
              <span className="text-white text-sm mr-2">{label}</span>
              <button 
                onClick={() => handleRemoveLabel(label)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>
          ))}
          {labels.length === 0 && (
            <p className="text-muted-foreground text-sm">No labels</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New label name"
            className="flex-1"
          />
          <Button 
            onClick={handleAddLabel}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Sección de Properties */}
      <div className="space-y-2">
        <h3 className="text-md font-medium text-white">Properties</h3>
        {properties.map((prop, index) => (
          <div key={index} className="flex gap-2 items-center">
            <Input
              value={prop.key}
              onChange={(e) => handleUpdateProperty(index, e.target.value, prop.value)}
              placeholder="Key"
              className="flex-1"
            />
            <Input
              value={prop.value}
              onChange={(e) => handleUpdateProperty(index, prop.key, e.target.value)}
              placeholder="Value"
              className="flex-1"
            />
            <Button 
              onClick={() => handleRemoveProperty(index)}
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-red-500"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {properties.length === 0 && (
          <p className="text-muted-foreground text-sm">No properties</p>
        )}
        <div className="flex gap-2 mt-2">
          <Input
            value={newPropertyKey}
            onChange={(e) => setNewPropertyKey(e.target.value)}
            placeholder="New property key"
            className="flex-1"
          />
          <Input
            value={newPropertyValue}
            onChange={(e) => setNewPropertyValue(e.target.value)}
            placeholder="Value"
            className="flex-1"
          />
          <Button 
            onClick={handleAddProperty}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Botón para guardar (crear/actualizar nodo) */}
      <Button 
        onClick={handleSave}
        className="w-full"
      >
        <Save className="mr-2 h-4 w-4" />
        {isNew ? 'Create Node' : 'Save Changes'}
      </Button>
      
      {/* Sección para crear relación (solo para nodos existentes) */}
      {!isNew && node && (
        <div className="space-y-2 border-t border-brain-secondary pt-4 mt-4">
          <h3 className="text-md font-medium text-white">Create Relationship</h3>
          <div className="space-y-2">
            <Label>Target Node ID</Label>
            <Input
              value={targetNodeId}
              onChange={(e) => setTargetNodeId(e.target.value)}
              placeholder="Enter target node elementId"
            />
          </div>
          <div className="space-y-2">
            <Label>Relationship Type</Label>
            <Input
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value)}
              placeholder="e.g., KNOWS, HAS_PROPERTY"
            />
          </div>
          <Button 
            onClick={handleCreateRelationship}
            variant="outline"
            className="w-full"
          >
            Create Relationship
          </Button>
        </div>
      )}
    </div>
  );
};

export default NodeEditor;
