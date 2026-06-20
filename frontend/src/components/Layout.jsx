import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Map, User, Settings, LogOut, Compass } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const Item = ({ to, icon: Icon, label, testid }) => (
    <NavLink
      to={to}
      data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-medium tracking-wide transition-colors ${
          isActive ? "bg-[#FF4F00] text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
        }`
      }
    >
      <Icon size={16} strokeWidth={1.6} />
      {label}
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0A0A0A] text-neutral-200 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-center gap-3" data-testid="sidebar-brand">
            <div className="w-8 h-8 bg-[#FF4F00] flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">L</span>
            </div>
            <span className="font-display font-bold tracking-tight">LeadMap<span className="text-[#FF4F00]">.</span></span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-neutral-500 font-mono">v1.0 / Operator</div>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          <div className="px-4 mb-2 label-eyebrow text-neutral-500">Workspace</div>
          <Item to="/dashboard" icon={Compass} label="Lead Explorer" testid="nav-dashboard" />
          <Item to="/profile" icon={User} label="Profile" testid="nav-profile" />
          {user?.is_master && (
            <>
              <div className="px-4 mt-6 mb-2 label-eyebrow text-neutral-500">Master</div>
              <Item to="/admin" icon={Settings} label="Admin Console" testid="nav-admin" />
            </>
          )}
        </nav>

        <div className="border-t border-neutral-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-9 h-9 object-cover" />
            ) : (
              <div className="w-9 h-9 bg-neutral-800 flex items-center justify-center text-sm font-display font-bold">
                {(user?.name || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" data-testid="sidebar-user-name">{user?.name}</div>
              <div className="text-[10px] text-neutral-500 truncate font-mono">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-white scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
