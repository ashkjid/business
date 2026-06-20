import React, { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import MapPicker from "../components/MapPicker";
import ResultsTable from "../components/ResultsTable";
import EmailComposer from "../components/EmailComposer";
import WhatsAppComposer from "../components/WhatsAppComposer";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Search, Loader2, Download, Mail, MessageCircle, FileText, ChevronLeft, ChevronRight, Compass } from "lucide-react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";

const BUSINESS_TYPES = [
  "Cafes", "Restaurants", "Hotels", "Salons & Spas", "Gyms & Fitness",
  "Real Estate", "Retail Stores", "Pharmacies", "Schools & Coaching",
  "Hospitals & Clinics", "Auto Repair", "Travel Agencies", "Event Planners",
  "Boutiques", "Bakeries", "Dental Clinics", "Lawyers", "Accountants",
];
const PAGE_SIZE = 50;
const RADIUS_OPTIONS = [
  { v: 1000, l: "1 km" }, { v: 3000, l: "3 km" }, { v: 5000, l: "5 km" },
  { v: 10000, l: "10 km" }, { v: 20000, l: "20 km" }, { v: 50000, l: "50 km" },
];

export default function Dashboard() {
  const { user, config } = useAuth();
  const [location, setLocation] = useState(null); // { lat, lng, location_name }
  const [category, setCategory] = useState("");
  const [radius, setRadius] = useState(5000);
  const [dataSource, setDataSource] = useState("api");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "rating", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [sendCount, setSendCount] = useState("");

  // Non-master limited to 2 distinct business types per session
  const [usedCategories, setUsedCategories] = useState(new Set());

  const sortedResults = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [results, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / PAGE_SIZE));
  const pageRows = sortedResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onSort = (key) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllPage = (rows, on) => setSelected((s) => {
    const n = new Set(s);
    rows.forEach((r) => on ? n.add(r.place_id) : n.delete(r.place_id));
    return n;
  });
  const selectFromTop = (count) => {
    const ids = sortedResults.slice(0, count).map((r) => r.place_id);
    setSelected(new Set(ids));
  };
  const selectAll = () => setSelected(new Set(sortedResults.map((r) => r.place_id)));
  const clearSelection = () => setSelected(new Set());

  const search = async () => {
    if (!location) { toast.error("Click a point on the map first"); return; }
    if (!category) { toast.error("Select a business category"); return; }
    if (!user.is_master) {
      const next = new Set(usedCategories); next.add(category);
      if (next.size > 2) { toast.error("Non-master users are limited to 2 different business types per session."); return; }
      setUsedCategories(next);
    }
    setLoading(true);
    setSelected(new Set());
    setPage(1);
    try {
      const r = await api.post("/places/search", {
        latitude: location.lat,
        longitude: location.lng,
        radius_meters: radius,
        business_type: category,
        location_name: location.location_name,
        data_source: dataSource,
      });
      setResults(r.data.results);
      toast.success(`Found ${r.data.total} results`);
      // Deep crawl emails for items with website
      const items = r.data.results.filter((p) => p.website).map((p) => ({ place_id: p.place_id, website: p.website }));
      if (items.length) {
        setEmailLoading(true);
        api.post("/places/extract-emails", { items }).then((er) => {
          const emails = er.data.emails || {};
          setResults((prev) => prev.map((p) => emails[p.place_id] ? { ...p, email: emails[p.place_id] } : p));
        }).catch(() => {}).finally(() => setEmailLoading(false));
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Search failed");
    } finally { setLoading(false); }
  };

  const exportExcel = async () => {
    if (!user.can_export) { toast.error("Export disabled. Ask master to enable for your account."); return; }
    const XLSX = await import("xlsx");
    const data = (selected.size ? sortedResults.filter((r) => selected.has(r.place_id)) : sortedResults).map((r) => ({
      Name: r.name, Address: r.address, Phone: r.phone || "", Email: r.email || "",
      Rating: r.rating ?? "", Reviews: r.review_count ?? "", Hours: r.opening_hours || "",
      Website: r.website || "", "Google URL": r.google_url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `leadmap-${category}-${Date.now()}.xlsx`);
  };

  const exportPDF = async () => {
    if (!user.can_export) { toast.error("Export disabled. Ask master to enable for your account."); return; }
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const rowsToExport = selected.size ? sortedResults.filter((r) => selected.has(r.place_id)) : sortedResults;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text(`LeadMap Export — ${category}`, 14, 16);
    doc.setFontSize(9); doc.setTextColor(100); doc.text(`${rowsToExport.length} leads · ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Name", "Address", "Phone", "Email", "Rating", "Reviews", "Website"]],
      body: rowsToExport.map((r) => [r.name, r.address, r.phone || "", r.email || "", r.rating ?? "", r.review_count ?? "", r.website || ""]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [255, 79, 0] },
    });
    doc.save(`leadmap-${category}-${Date.now()}.pdf`);
  };

  const selectedRows = sortedResults.filter((r) => selected.has(r.place_id));
  const recipientsForEmail = selectedRows.map((r) => ({ name: r.name, email: r.email })).filter((r) => r.email);
  const recipientsForWA = selectedRows.map((r) => ({ name: r.name, phone: r.phone })).filter((r) => r.phone);
  const apiKey = config.google_oauth_client_id ? null : process.env.REACT_APP_GOOGLE_PLACES_API_KEY;

  return (
    <Layout>
      <div className="px-8 py-8 pb-32">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="label-eyebrow mb-2">Lead Explorer</div>
            <h1 className="text-4xl font-display font-bold tracking-tighter">Find businesses on the map.</h1>
            <p className="text-sm text-neutral-600 mt-2">Click any location on the map → pick a category → fetch verified leads.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!user.is_master && (
              <Badge variant="outline" className="rounded-none label-eyebrow" data-testid="usage-badge">
                {usedCategories.size}/2 categories used
              </Badge>
            )}
            {user.is_master && <Badge className="rounded-none bg-[#FF4F00]">MASTER</Badge>}
          </div>
        </div>

        {/* Search panel */}
        <div className="grid grid-cols-12 gap-6 mb-8">
          <div className="col-span-12 lg:col-span-8 h-[420px] border border-neutral-200">
            <MapPicker apiKey={process.env.REACT_APP_GOOGLE_PLACES_API_KEY} value={location} onChange={setLocation} />
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-4 border border-neutral-200 p-6 bg-neutral-50">
            <div>
              <Label className="label-eyebrow">Selected location</Label>
              <div className="mt-2 text-xs font-mono text-neutral-700 min-h-[40px] break-words" data-testid="selected-location">
                {location ? (location.location_name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`) : <span className="text-neutral-400">Click on the map…</span>}
              </div>
            </div>
            <div>
              <Label className="label-eyebrow">Business category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="category-select" className="mt-2 rounded-none h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-eyebrow">Search radius</Label>
              <Select value={String(radius)} onValueChange={(v) => setRadius(parseInt(v))}>
                <SelectTrigger data-testid="radius-select" className="mt-2 rounded-none h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {user.is_master && (
              <div>
                <Label className="label-eyebrow">Data source (master)</Label>
                <Select value={dataSource} onValueChange={setDataSource}>
                  <SelectTrigger data-testid="data-source-select" className="mt-2 rounded-none h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">Google Places API</SelectItem>
                    <SelectItem value="scraper">Web Scraper (mocked)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={search} disabled={loading || !location || !category} data-testid="search-submit-btn" className="w-full h-11 rounded-none bg-[#FF4F00] hover:bg-[#CC3F00] text-white font-medium">
              {loading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Search size={16} className="mr-2" />}
              Run prospecting search
            </Button>
          </div>
        </div>

        {/* Results meta */}
        {results.length > 0 && (
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight" data-testid="results-heading">Results</h2>
              <Badge variant="outline" className="rounded-none label-eyebrow" data-testid="total-count-badge">{results.length} TOTAL</Badge>
              <Badge variant="outline" className="rounded-none label-eyebrow" data-testid="selected-count-badge">{selected.size} SELECTED</Badge>
              {emailLoading && <Badge variant="outline" className="rounded-none label-eyebrow text-orange-600">extracting emails…</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Pagination page={page} total={totalPages} onChange={setPage} testid="pagination-top" />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!results.length && !loading && (
          <div className="border border-neutral-200 grid-bg p-16 text-center" data-testid="empty-state">
            <Compass size={32} className="mx-auto text-neutral-400" strokeWidth={1.2} />
            <p className="mt-4 text-sm text-neutral-600 max-w-md mx-auto">
              Select a location on the map and choose a category to begin prospecting. Email addresses are auto-extracted from each business website.
            </p>
          </div>
        )}

        {/* Table */}
        {results.length > 0 && (
          <ResultsTable
            rows={pageRows}
            sort={sort}
            onSort={onSort}
            selected={selected}
            onToggle={toggle}
            onToggleAllPage={toggleAllPage}
            emailLoading={emailLoading}
          />
        )}

        {/* Bottom pagination */}
        {results.length > 0 && (
          <div className="flex justify-end mt-4">
            <Pagination page={page} total={totalPages} onChange={setPage} testid="pagination-bottom" />
          </div>
        )}
      </div>

      {/* Sticky bulk action toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0A0A0A] text-white shadow-2xl flex items-stretch divide-x divide-neutral-800" data-testid="bulk-toolbar">
          <div className="px-5 py-3 flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Selected</div>
            <div className="font-display font-bold text-lg">{selected.size} of {results.length}</div>
          </div>
          <div className="px-3 py-3 flex items-center gap-2">
            <Input type="number" min="1" placeholder="N" value={sendCount} onChange={(e) => setSendCount(e.target.value)} className="w-20 h-9 rounded-none bg-neutral-900 border-neutral-700 text-white text-xs" data-testid="select-from-top-input" />
            <Button size="sm" variant="ghost" className="rounded-none text-white hover:bg-neutral-800 text-xs" onClick={() => sendCount && selectFromTop(parseInt(sendCount))} data-testid="select-from-top-btn">
              Select first N
            </Button>
            <Button size="sm" variant="ghost" className="rounded-none text-white hover:bg-neutral-800 text-xs" onClick={selectAll} data-testid="select-all-btn">All</Button>
            <Button size="sm" variant="ghost" className="rounded-none text-white hover:bg-neutral-800 text-xs" onClick={clearSelection} data-testid="clear-selection-btn">Clear</Button>
          </div>
          <button onClick={() => setEmailOpen(true)} data-testid="bulk-email-btn" className="px-5 hover:bg-[#FF4F00] flex items-center gap-2 text-sm font-medium">
            <Mail size={15} /> Email
          </button>
          <button onClick={() => setWaOpen(true)} data-testid="bulk-whatsapp-btn" className="px-5 hover:bg-[#25D366] flex items-center gap-2 text-sm font-medium">
            <MessageCircle size={15} /> WhatsApp
          </button>
          {user.can_export && (
            <>
              <button onClick={exportExcel} data-testid="bulk-export-excel-btn" className="px-5 hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium">
                <Download size={15} /> Excel
              </button>
              <button onClick={exportPDF} data-testid="bulk-export-pdf-btn" className="px-5 hover:bg-blue-700 flex items-center gap-2 text-sm font-medium">
                <FileText size={15} /> PDF
              </button>
            </>
          )}
        </div>
      )}

      <EmailComposer
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        recipients={recipientsForEmail}
        fromEmail={user?.email}
        hasGmailConfig={user?.has_gmail_config}
        isMaster={user?.is_master}
      />
      <WhatsAppComposer open={waOpen} onClose={() => setWaOpen(false)} recipients={recipientsForWA} />
    </Layout>
  );
}

function Pagination({ page, total, onChange, testid }) {
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(total, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="flex items-center gap-1" data-testid={testid}>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="w-9 h-9 flex items-center justify-center border border-neutral-200 disabled:opacity-30 hover:bg-neutral-100" data-testid={`${testid}-prev`}>
        <ChevronLeft size={14} />
      </button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)} className={`w-9 h-9 text-xs font-mono border ${p === page ? "bg-black text-white border-black" : "border-neutral-200 hover:bg-neutral-100"}`} data-testid={`${testid}-page-${p}`}>
          {p}
        </button>
      ))}
      <button disabled={page >= total} onClick={() => onChange(page + 1)} className="w-9 h-9 flex items-center justify-center border border-neutral-200 disabled:opacity-30 hover:bg-neutral-100" data-testid={`${testid}-next`}>
        <ChevronRight size={14} />
      </button>
      <span className="ml-2 text-xs text-neutral-500 font-mono">Page {page}/{total}</span>
    </div>
  );
}
