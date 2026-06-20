import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Save, Key, Database, Users } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

export default function Admin() {
  const [settings, setSettings] = useState({ google_places_api_key: "", data_source: "api" });
  const [users, setUsers] = useState([]);
  const [savingKey, setSavingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { (async () => { await loadAll(); })(); }, []);

  const loadAll = async () => {
    try {
      const [s, u] = await Promise.all([api.get("/admin/settings"), api.get("/admin/users")]);
      setSettings(s.data);
      setUsers(u.data.users);
    } catch (err) {
      toast.error("Failed to load admin data");
    }
  };

  const saveKey = async () => {
    setSavingKey(true);
    try {
      await api.put("/admin/settings", { google_places_api_key: settings.google_places_api_key });
      toast.success("Google Places API key updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setSavingKey(false); }
  };

  const saveDataSource = async (val) => {
    try {
      await api.put("/admin/settings", { data_source: val });
      setSettings((s) => ({ ...s, data_source: val }));
      toast.success(`Data source set to: ${val.toUpperCase()}`);
    } catch (err) {
      toast.error("Failed to update data source");
    }
  };

  const togglePerm = async (email, val) => {
    try {
      await api.put(`/admin/users/${encodeURIComponent(email)}/permissions`, { can_export: val });
      setUsers((us) => us.map((u) => u.email === email ? { ...u, can_export: val } : u));
      toast.success(`Export ${val ? "enabled" : "disabled"} for ${email}`);
    } catch (err) {
      toast.error("Failed to update permission");
    }
  };

  return (
    <Layout>
      <div className="px-8 py-8 max-w-6xl">
        <div className="label-eyebrow mb-2">Master only</div>
        <h1 className="text-4xl font-display font-bold tracking-tighter mb-2">Admin Console</h1>
        <p className="text-sm text-neutral-600 mb-8">Manage API keys, switch data sources, and grant export permissions to teammates.</p>

        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList className="rounded-none bg-transparent border-b border-neutral-200 w-full justify-start gap-6 p-0 h-auto">
            <TabsTrigger value="api-keys" data-testid="tab-api-keys" className="rounded-none label-eyebrow data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#FF4F00] data-[state=active]:text-black px-0 pb-3">
              <Key size={13} className="mr-2" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="data-source" data-testid="tab-data-source" className="rounded-none label-eyebrow data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#FF4F00] data-[state=active]:text-black px-0 pb-3">
              <Database size={13} className="mr-2" /> Data Source
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users" className="rounded-none label-eyebrow data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#FF4F00] data-[state=active]:text-black px-0 pb-3">
              <Users size={13} className="mr-2" /> User Permissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="pt-6">
            <div className="border border-neutral-200 p-6 max-w-2xl">
              <h2 className="font-display text-2xl font-semibold tracking-tight mb-1">Google Places API Key</h2>
              <p className="text-xs text-neutral-500 mb-4">Stored centrally — used by all users. Only you can change this.</p>
              <Label className="label-eyebrow">API Key</Label>
              <div className="relative mt-2">
                <Input
                  type={showKey ? "text" : "password"}
                  data-testid="api-key-input"
                  value={settings.google_places_api_key || ""}
                  onChange={(e) => setSettings({ ...settings, google_places_api_key: e.target.value })}
                  className="rounded-none h-11 pr-16 font-mono text-xs"
                />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <Button onClick={saveKey} disabled={savingKey} data-testid="api-key-save-btn" className="rounded-none h-11 mt-4 bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
                <Save size={14} className="mr-2" /> {savingKey ? "Saving…" : "Save API Key"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="data-source" className="pt-6">
            <div className="border border-neutral-200 p-6 max-w-2xl">
              <h2 className="font-display text-2xl font-semibold tracking-tight mb-1">Default Data Source</h2>
              <p className="text-xs text-neutral-500 mb-4">Non-master users always use the data source you select here.</p>
              <Label className="label-eyebrow">Source</Label>
              <Select value={settings.data_source} onValueChange={saveDataSource}>
                <SelectTrigger data-testid="admin-data-source-select" className="mt-2 rounded-none h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">Google Places API (recommended)</SelectItem>
                  <SelectItem value="scraper">Web Scraper (mocked → uses API)</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-4 text-xs text-neutral-500 font-mono">Current: {settings.data_source?.toUpperCase()}</div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="pt-6">
            <div className="border border-neutral-200" data-testid="users-table">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left py-3 px-4 label-eyebrow">User</th>
                    <th className="text-left py-3 px-4 label-eyebrow">Email</th>
                    <th className="text-left py-3 px-4 label-eyebrow">Business</th>
                    <th className="text-left py-3 px-4 label-eyebrow">Role</th>
                    <th className="text-left py-3 px-4 label-eyebrow">Last login</th>
                    <th className="text-left py-3 px-4 label-eyebrow">Excel/PDF Export</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`user-row-${u.email}`}>
                      <td className="py-3 px-4 font-medium">{u.name}</td>
                      <td className="py-3 px-4 font-mono text-xs">{u.email}</td>
                      <td className="py-3 px-4 text-xs">{u.business_type || "—"}</td>
                      <td className="py-3 px-4">
                        {u.is_master ? <Badge className="rounded-none bg-[#FF4F00]">MASTER</Badge> : <Badge variant="outline" className="rounded-none">User</Badge>}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-neutral-500">{u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td>
                      <td className="py-3 px-4">
                        {u.is_master ? (
                          <span className="text-xs text-emerald-700">Always allowed</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!u.can_export}
                              onCheckedChange={(v) => togglePerm(u.email, v)}
                              data-testid={`user-perm-toggle-${u.email}`}
                            />
                            <span className="text-xs">{u.can_export ? "Enabled" : "Disabled"}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr><td colSpan={6} className="text-center py-12 text-sm text-neutral-500">No users yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
