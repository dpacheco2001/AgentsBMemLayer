import React, { useState, useEffect } from 'react';
import { toast } from "sonner";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash, Plus, Save } from 'lucide-react';

interface Relationship {
  id?: number;
  source: string; // Ahora es string (elementId)
  target: string; // Ahora es string (elementId)
  type: string;
  properties: Record<string, any>;
}

interface RelationshipEditorProps {
  relationship: Relationship;
  executeQuery: (query: string) => Promise<any>;
  onClose: () => void;
}

const RelationshipEditor: React.FC<RelationshipEditorProps> = ({ 
  relationship, 
  executeQuery,
  onClose 
}) => {
  const [properties, setProperties] = useState<{ key: string; value: string }[]>([]);
  const [type, setType] = useState('');
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');

  // Inicializamos propiedades y tipo cuando cambia la relación
  useEffect(() => {
    if (!relationship) return;
    setType(relationship.type);
    const props = relationship.properties 
      ? Object.entries(relationship.properties)
          .map(([key, value]) => ({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value)
          }))
      : [];
    setProperties(props);
  }, [relationship]);

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
    setProperties(properties.filter((_, i) => i !== index));
  };

  const formatValueForCypher = (value: string) => {
    if (!isNaN(Number(value))) {
      return value;
    }
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return value.toLowerCase();
    }
    try {
      JSON.parse(value);
      return value;
    } catch (e) {
      return `'${value.replace(/'/g, "\\'")}'`;
    }
  };

  const convertValueType = (value: string) => {
    if (!isNaN(Number(value))) {
      return Number(value);
    }
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  };

  const handleSave = async () => {
    try {
      const relationshipId = relationship.id;
      if (!relationshipId) {
        toast.error('Relationship ID is missing');
        return;
      }
      let query = '';
      // Si el tipo ha cambiado, necesitamos recrear la relación (cambio de tipo no se puede modificar directamente)
      if (type !== relationship.type) {
        query = `
          MATCH (a)-[r]->(b) 
          WHERE ID(r) = ${relationshipId} 
          WITH a, b 
          DELETE r 
          CREATE (a)-[new:${type}]->(b) 
          SET new = ${JSON.stringify(
            properties.reduce((obj, prop) => {
              obj[prop.key] = convertValueType(prop.value);
              return obj;
            }, {} as Record<string, any>)
          )} 
          RETURN new
        `;
        const result = await executeQuery(query);
        if (result.error) {
          toast.error(`Error updating relationship: ${result.error}`);
          return;
        }
      } else {
        // Actualizamos solo las propiedades
        const propsArray = properties
          .map(p => `r.${p.key} = ${formatValueForCypher(p.value)}`)
          .join(', ');
        if (propsArray) {
          query = `MATCH ()-[r]->() WHERE elementId(r) = '${relationshipId}' SET ${propsArray} RETURN r`;
          const result = await executeQuery(query);
          if (result.error) {
            toast.error(`Error updating relationship: ${result.error}`);
            return;
          }
        }
      }
      toast.success('Relationship updated successfully');
      onClose();
    } catch (error) {
      console.error('Error saving relationship:', error);
      toast.error('Failed to save relationship');
    }
  };

  if (!relationship) {
    return <div>No relationship selected</div>;
  }

  return (
    <div className="space-y-6">
      {/* Relationship Type */}
      <div className="space-y-2">
        <h3 className="text-md font-medium text-white">Relationship Type</h3>
        <Input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Relationship type"
        />
      </div>
      
      {/* Relationship Details */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-brain-secondary/60 p-2 rounded-md">
          <span className="text-muted-foreground">Source Node ID:</span>
          <span className="text-white ml-2">{relationship.source}</span>
        </div>
        <div className="bg-brain-secondary/60 p-2 rounded-md">
          <span className="text-muted-foreground">Target Node ID:</span>
          <span className="text-white ml-2">{relationship.target}</span>
        </div>
      </div>
      
      {/* Properties Section */}
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
      
      {/* Save Button */}
      <Button 
        onClick={handleSave}
        className="w-full"
      >
        <Save className="mr-2 h-4 w-4" />
        Save Changes
      </Button>
    </div>
  );
};

export default RelationshipEditor;
