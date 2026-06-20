import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Star } from "lucide-react";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";

const COLS = [
  { key: "name", label: "Business" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "rating", label: "Rating", numeric: true },
  { key: "review_count", label: "Reviews", numeric: true },
  { key: "opening_hours", label: "Hours" },
  { key: "website", label: "Website" },
];

export default function ResultsTable({ rows, sort, onSort, selected, onToggle, onToggleAllPage, emailLoading }) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.place_id));
  const someSelected = rows.some((r) => selected.has(r.place_id)) && !allSelected;

  return (
    <div className="border border-neutral-200" data-testid="results-table">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0 z-10">
            <tr>
              <th className="w-10 py-3 px-3">
                <Checkbox
                  data-testid="table-select-all-page"
                  checked={allSelected}
                  onCheckedChange={(v) => onToggleAllPage(rows, !!v)}
                  className={someSelected ? "data-[state=checked]:bg-neutral-400" : ""}
                />
              </th>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    data-testid={`table-sort-${c.key}`}
                    className="text-left py-3 px-3 label-eyebrow cursor-pointer select-none whitespace-nowrap hover:text-black"
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <Icon size={12} className={active ? "text-[#FF4F00]" : "text-neutral-400"} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const checked = selected.has(r.place_id);
              return (
                <tr
                  key={r.place_id || idx}
                  data-testid={`table-row-${idx}`}
                  className={`border-b border-neutral-100 hover:bg-neutral-50 ${checked ? "bg-orange-50/40" : ""}`}
                >
                  <td className="py-3 px-3 align-top">
                    <Checkbox
                      data-testid={`table-row-checkbox-${idx}`}
                      checked={checked}
                      onCheckedChange={() => onToggle(r.place_id)}
                    />
                  </td>
                  <td className="py-3 px-3 align-top max-w-[260px]">
                    <div className="font-medium text-neutral-900 truncate">{r.name}</div>
                    {r.types?.length ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.types.slice(0, 2).map((t) => (
                          <span key={t} className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">{t.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 px-3 align-top max-w-[280px] text-neutral-700 truncate">{r.address || "—"}</td>
                  <td className="py-3 px-3 align-top text-neutral-700 whitespace-nowrap">{r.phone || <span className="text-neutral-400">—</span>}</td>
                  <td className="py-3 px-3 align-top text-neutral-700 whitespace-nowrap">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="text-[#FF4F00] hover:underline">{r.email}</a>
                    ) : emailLoading ? (
                      <span className="text-neutral-400 italic text-xs">extracting…</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top">
                    {r.rating != null ? (
                      <Badge className="rounded-none bg-black text-white hover:bg-black gap-1">
                        <Star size={11} fill="#FF4F00" stroke="#FF4F00" /> {r.rating.toFixed(1)}
                      </Badge>
                    ) : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="py-3 px-3 align-top text-neutral-700 font-mono text-xs">{r.review_count ?? "—"}</td>
                  <td className="py-3 px-3 align-top max-w-[200px] text-neutral-600 text-xs truncate">{r.opening_hours || "—"}</td>
                  <td className="py-3 px-3 align-top">
                    {r.website ? (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-[#FF4F00] hover:underline inline-flex items-center gap-1">
                        Visit <ExternalLink size={11} />
                      </a>
                    ) : <span className="text-neutral-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
