'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Pencil, Star } from 'lucide-react';
import { load as loadStore } from '@tauri-apps/plugin-store';
import { BrandTemplate } from '@/lib/docxExport';

interface BrandTemplateInfo {
  id: string;
  name: string;
  is_bundled: boolean;
}

interface EditingState {
  template: BrandTemplate;
  logoBytes: Uint8Array | null;
  logoPreviewUrl: string | null;
  isNew: boolean;
}

export function ExportSettings() {
  const [templates, setTemplates] = useState<BrandTemplateInfo[]>([]);
  const [defaultBrandId, setDefaultBrandId] = useState<string>('iq-standard');
  const [editing, setEditing] = useState<EditingState | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const list = await invoke<BrandTemplateInfo[]>('api_list_brand_templates');
      setTemplates(list);
    } catch (e) {
      console.error('Failed to load brand templates:', e);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    // Load default brand selection
    (async () => {
      try {
        const store = await loadStore('settings.json');
        const saved = await store.get<string>('selectedBrandId');
        if (saved) setDefaultBrandId(saved);
      } catch {
        // ignore
      }
    })();
  }, [loadTemplates]);

  const handleSetDefault = async (id: string) => {
    setDefaultBrandId(id);
    try {
      const store = await loadStore('settings.json');
      await store.set('selectedBrandId', id);
      await store.save();
      toast.success('Default brand template updated');
    } catch {
      toast.error('Failed to save default brand template');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('api_delete_brand_template', { id });
      toast.success('Brand template deleted');
      if (defaultBrandId === id) {
        await handleSetDefault('iq-standard');
      }
      await loadTemplates();
    } catch (e) {
      toast.error(`Failed to delete: ${e}`);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const tmpl = await invoke<BrandTemplate>('api_get_brand_template', { id });
      const logoData = await invoke<number[] | null>('api_get_brand_template_logo', { id });
      const logoBytes = logoData ? new Uint8Array(logoData) : null;
      const logoPreviewUrl = logoBytes
        ? URL.createObjectURL(new Blob([logoBytes], { type: 'image/png' }))
        : null;
      setEditing({ template: tmpl, logoBytes, logoPreviewUrl, isNew: false });
    } catch (e) {
      toast.error(`Failed to load template: ${e}`);
    }
  };

  const handleAddNew = () => {
    setEditing({
      template: {
        id: '',
        name: '',
        fonts: { heading: 'Calibri', body: 'Calibri' },
        colors: { primary: '333333', secondary: '666666', heading: '333333', body: '333333' },
        headingSizes: { h1: 32, h2: 26, h3: 22 },
      },
      logoBytes: null,
      logoPreviewUrl: null,
      isNew: true,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    const { template, logoBytes } = editing;

    if (!template.id.trim() || !template.name.trim()) {
      toast.error('ID and Name are required');
      return;
    }

    // Validate ID format (lowercase, hyphens only)
    if (!/^[a-z0-9-]+$/.test(template.id)) {
      toast.error('ID must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    try {
      await invoke('api_save_brand_template', {
        template,
        logoBytes: logoBytes ? Array.from(logoBytes) : null,
      });
      toast.success('Brand template saved');
      setEditing(null);
      await loadTemplates();
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;

    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      const previewUrl = URL.createObjectURL(file);
      const logoFilename = `${editing.template.id}-logo.png`;
      setEditing({
        ...editing,
        logoBytes: bytes,
        logoPreviewUrl: previewUrl,
        template: { ...editing.template, logo: logoFilename },
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const updateField = <K extends keyof BrandTemplate>(key: K, value: BrandTemplate[K]) => {
    if (!editing) return;
    setEditing({ ...editing, template: { ...editing.template, [key]: value } });
  };

  if (editing) {
    const { template, logoPreviewUrl, isNew } = editing;
    return (
      <div className="space-y-6 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isNew ? 'New Brand Template' : `Edit: ${template.name}`}
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
            <input
              type="text"
              value={template.id}
              onChange={(e) => updateField('id', e.target.value)}
              disabled={!isNew}
              placeholder="my-brand"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={template.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="My Brand"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
          <div className="flex items-center gap-4">
            {logoPreviewUrl && (
              <img src={logoPreviewUrl} alt="Logo preview" className="h-12 object-contain rounded border p-1" />
            )}
            <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} className="text-sm" />
          </div>
        </div>

        {/* Fonts */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Heading Font</label>
            <select
              value={template.fonts.heading}
              onChange={(e) => updateField('fonts', { ...template.fonts, heading: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {['Calibri', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body Font</label>
            <select
              value={template.fonts.body}
              onChange={(e) => updateField('fonts', { ...template.fonts, body: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {['Calibri', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Colors */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Colors</label>
          <div className="grid grid-cols-4 gap-4">
            {(['primary', 'secondary', 'heading', 'body'] as const).map((colorKey) => (
              <div key={colorKey}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">{colorKey}</label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: `#${template.colors[colorKey]}` }}
                  />
                  <input
                    type="text"
                    value={template.colors[colorKey]}
                    onChange={(e) => {
                      const val = e.target.value.replace('#', '');
                      updateField('colors', { ...template.colors, [colorKey]: val });
                    }}
                    placeholder="7A00DF"
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    maxLength={6}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Heading Sizes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Heading Sizes (half-points)</label>
          <div className="grid grid-cols-3 gap-4">
            {(['h1', 'h2', 'h3'] as const).map((hKey) => (
              <div key={hKey}>
                <label className="block text-xs text-gray-500 mb-1 uppercase">{hKey}</label>
                <input
                  type="number"
                  value={template.headingSizes[hKey]}
                  onChange={(e) => updateField('headingSizes', { ...template.headingSizes, [hKey]: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Header / Footer */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Text</label>
            <input
              type="text"
              value={template.header || ''}
              onChange={(e) => updateField('header', e.target.value || undefined)}
              placeholder="Use {title} and {date} placeholders"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
            <input
              type="text"
              value={template.footer || ''}
              onChange={(e) => updateField('footer', e.target.value || undefined)}
              placeholder="Use {date} placeholder"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Brand Templates</h3>
          <p className="text-sm text-gray-500">Manage brand templates used when exporting Word documents.</p>
        </div>
        <Button size="sm" onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-1" />
          Add New
        </Button>
      </div>

      <div className="space-y-3">
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{tmpl.name}</span>
              {tmpl.is_bundled && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Bundled</span>
              )}
              {tmpl.id === defaultBrandId && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Default</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {tmpl.id !== defaultBrandId && (
                <Button variant="outline" size="sm" onClick={() => handleSetDefault(tmpl.id)} title="Set as default">
                  <Star className="h-3 w-3" />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handleEdit(tmpl.id)} title="Edit">
                <Pencil className="h-3 w-3" />
              </Button>
              {!tmpl.is_bundled && (
                <Button variant="outline" size="sm" onClick={() => handleDelete(tmpl.id)} title="Delete">
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {templates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No brand templates found.</p>
        )}
      </div>
    </div>
  );
}
