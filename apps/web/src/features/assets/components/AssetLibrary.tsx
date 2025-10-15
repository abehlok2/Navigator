import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeGrid as Grid, FixedSizeList as List } from 'react-window';
import { LayoutGrid, List as ListIcon, Search, Upload } from 'lucide-react';

import type { AssetManifest } from '../../control/protocol';
import AssetCard, { type AssetActionState } from './AssetCard';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { useSessionStore } from '../../../state/session';
import { getAudioContext } from '../../audio/context';
import {
  digestSha256,
  getRawAssetById,
  registerRawAsset,
  setBuffer,
} from '../../audio/assets';

const GRID_CARD_HEIGHT = 420;
const LIST_CARD_HEIGHT = 420;
const GRID_GAP = 16;

function getColumnCount(width: number) {
  if (width >= 1440) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function ensurePositive(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      setSize({ width: element.offsetWidth, height: element.offsetHeight });
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return { ref, size } as const;
}

type ManifestEntry = AssetManifest['entries'][number] & {
  duration?: number;
  createdAt?: number;
  updatedAt?: number;
};

type ViewMode = 'grid' | 'list';
type FilterMode = 'all' | 'loaded' | 'missing';
type SortMode = 'name' | 'size' | 'date';

interface AssetListItem {
  entry: ManifestEntry;
  localStatus: 'loaded' | 'loading' | 'missing';
  remoteStatus: 'loaded' | 'missing';
  remoteIssue: boolean;
  progress: number;
}

const sortComparators: Record<SortMode, (a: AssetListItem, b: AssetListItem) => number> = {
  name: (a, b) => {
    const nameA = (a.entry.title || a.entry.id).toLowerCase();
    const nameB = (b.entry.title || b.entry.id).toLowerCase();
    return nameA.localeCompare(nameB);
  },
  size: (a, b) => b.entry.bytes - a.entry.bytes,
  date: (a, b) => {
    const getDate = (entry: ManifestEntry) => entry.updatedAt ?? entry.createdAt ?? 0;
    return getDate(b.entry) - getDate(a.entry);
  },
};

interface GridCellProps {
  columnIndex: number;
  data: {
    items: AssetListItem[];
    columnCount: number;
    onToggleSelect: (id: string) => void;
    isSelected: (id: string) => boolean;
    isFacilitator: boolean;
    actionState: Record<string, AssetActionState | undefined>;
    onLoad: (id: string) => void;
    onUnload: (id: string) => void;
  };
  rowIndex: number;
  style: React.CSSProperties;
}

interface ListRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    items: AssetListItem[];
    onToggleSelect: (id: string) => void;
    isSelected: (id: string) => boolean;
    isFacilitator: boolean;
    actionState: Record<string, AssetActionState | undefined>;
    onLoad: (id: string) => void;
    onUnload: (id: string) => void;
  };
}

const GridCell: React.FC<GridCellProps> = ({ columnIndex, rowIndex, style, data }) => {
  const { items, columnCount, onToggleSelect, isSelected, isFacilitator, actionState, onLoad, onUnload } = data;
  const itemIndex = rowIndex * columnCount + columnIndex;
  const item = items[itemIndex];
  if (!item) {
    return <div style={style} />;
  }
  return (
    <div style={{ ...style, padding: GRID_GAP / 2, boxSizing: 'border-box' }}>
      <AssetCard
        entry={item.entry}
        localStatus={item.localStatus}
        progress={item.progress}
        isSelected={isSelected(item.entry.id)}
        onToggleSelect={onToggleSelect}
        isFacilitator={isFacilitator}
        remoteStatus={item.remoteStatus}
        remoteIssue={item.remoteIssue}
        actionState={actionState[item.entry.id]}
        onLoad={() => onLoad(item.entry.id)}
        onUnload={() => onUnload(item.entry.id)}
      />
    </div>
  );
};

const ListRow: React.FC<ListRowProps> = ({ index, style, data }) => {
  const { items, onToggleSelect, isSelected, isFacilitator, actionState, onLoad, onUnload } = data;
  const item = items[index];
  if (!item) {
    return <div style={style} />;
  }
  return (
    <div style={{ ...style, padding: GRID_GAP / 2, boxSizing: 'border-box' }}>
      <AssetCard
        entry={item.entry}
        localStatus={item.localStatus}
        progress={item.progress}
        isSelected={isSelected(item.entry.id)}
        onToggleSelect={onToggleSelect}
        isFacilitator={isFacilitator}
        remoteStatus={item.remoteStatus}
        remoteIssue={item.remoteIssue}
        actionState={actionState[item.entry.id]}
        onLoad={() => onLoad(item.entry.id)}
        onUnload={() => onUnload(item.entry.id)}
      />
    </div>
  );
};

function createSkeleton(count: number) {
  return (
    <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex h-[340px] flex-col justify-between rounded-[28px] border border-white/10 bg-white/5 p-6 text-slate-300/60 shadow-inner shadow-white/10"
        >
          <div className="space-y-4">
            <div className="h-6 w-2/3 animate-pulse rounded-full bg-white/10" />
            <div className="h-5 w-1/3 animate-pulse rounded-full bg-white/10" />
            <div className="h-20 w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full animate-pulse rounded-full bg-white/10" />
            <div className="h-2 w-full animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AssetLibrary() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { ref: contentRef, size: contentSize } = useElementSize<HTMLDivElement>();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkActionValue, setBulkActionValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionState, setActionState] = useState<Record<string, AssetActionState>>({});

  const {
    role,
    connection,
    manifestEntries,
    assetProgress,
    localAssets,
    remoteAssets,
    remoteMissing,
    control,
    addAsset,
    removeAsset,
    setAssetProgress,
  } = useSessionStore(state => ({
    role: state.role,
    connection: state.connection,
    manifestEntries: Object.values(state.manifest) as ManifestEntry[],
    assetProgress: state.assetProgress,
    localAssets: state.assets,
    remoteAssets: state.remoteAssets,
    remoteMissing: state.remoteMissing,
    control: state.control,
    addAsset: state.addAsset,
    removeAsset: state.removeAsset,
    setAssetProgress: state.setAssetProgress,
  }));

  const manifestMap = useMemo(() => new Map(manifestEntries.map(entry => [entry.id, entry] as const)), [manifestEntries]);

  useEffect(() => {
    setSelectedIds(prev => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (manifestMap.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, [manifestMap]);

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds(prev => (prev.size ? new Set() : prev));
    }
  }, [bulkMode]);

  const updateActionState = useCallback((id: string, next: AssetActionState) => {
    setActionState(prev => ({ ...prev, [id]: next }));
  }, []);

  const toDataUrl = useCallback((data: ArrayBuffer, mimeType?: string) => {
    const bytes = new Uint8Array(data);
    let base64: string;
    if (typeof globalThis.btoa === 'function') {
      let binary = '';
      bytes.forEach(b => {
        binary += String.fromCharCode(b);
      });
      base64 = globalThis.btoa(binary);
    } else {
      const bufferCtor = (globalThis as any).Buffer as
        | { from(data: Uint8Array): { toString(encoding: string): string } }
        | undefined;
      if (!bufferCtor) {
        throw new Error('No base64 encoder available in this environment.');
      }
      base64 = bufferCtor.from(bytes).toString('base64');
    }
    const type = mimeType && mimeType.trim() ? mimeType : 'application/octet-stream';
    return `data:${type};base64,${base64}`;
  }, []);

  const handleLoad = useCallback(
    async (entryId: string) => {
      const entry = manifestMap.get(entryId);
      if (!entry) return;
      if (!control) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }

      updateActionState(entryId, {
        phase: 'loading',
        tone: 'info',
        message: 'Sending load command…',
      });

      try {
        const stored = getRawAssetById(entryId);
        const source = stored ? toDataUrl(stored.data, stored.mimeType) : undefined;
        await control.load({
          id: entryId,
          sha256: entry.sha256,
          bytes: entry.bytes,
          ...(source ? { source } : {}),
        });
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'success',
          message: 'Load command acknowledged.',
        });
      } catch (err) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: (err as Error).message || 'Failed to load asset.',
        });
      }
    },
    [control, manifestMap, toDataUrl, updateActionState]
  );

  const handleUnload = useCallback(
    async (entryId: string) => {
      if (!control) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }

      updateActionState(entryId, {
        phase: 'unloading',
        tone: 'info',
        message: 'Sending unload command…',
      });

      try {
        await control.unload({ id: entryId });
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'success',
          message: 'Unload command acknowledged.',
        });
      } catch (err) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: (err as Error).message || 'Failed to unload asset.',
        });
      }
    },
    [control, updateActionState]
  );

  const baseItems = useMemo<AssetListItem[]>(() => {
    return manifestEntries.map(entry => {
      const progress = assetProgress[entry.id];
      const pct = progress?.total ? Math.round((progress.loaded / Math.max(progress.total, 1)) * 100) : 0;
      const localStatus = localAssets.has(entry.id)
        ? 'loaded'
        : progress?.loaded
          ? 'loading'
          : 'missing';
      const remoteStatus = remoteAssets.has(entry.id) ? 'loaded' : 'missing';
      const remoteIssue = role === 'facilitator' && remoteMissing.has(entry.id);
      return {
        entry,
        localStatus,
        remoteStatus,
        remoteIssue,
        progress: pct,
      } satisfies AssetListItem;
    });
  }, [assetProgress, localAssets, manifestEntries, remoteAssets, remoteMissing, role]);

  const items = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return baseItems
      .filter(item => {
        const matchesFilter =
          filterMode === 'all'
            ? true
            : filterMode === 'loaded'
              ? item.localStatus === 'loaded'
              : item.localStatus !== 'loaded';
        if (!matchesFilter) return false;
        if (!normalizedQuery) return true;
        const haystack = [item.entry.title, item.entry.id, item.entry.notes]
          .filter(Boolean)
          .map(value => value!.toLowerCase());
        return haystack.some(value => value.includes(normalizedQuery));
      })
      .sort(sortComparators[sortMode]);
  }, [baseItems, filterMode, searchQuery, sortMode]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const handleToggleSelect = useCallback(
    (id: string) => {
      setSelectedIds(prev => {
        if (!bulkMode) {
          if (prev.size === 1 && prev.has(id)) {
            return new Set();
          }
          return new Set([id]);
        }
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [bulkMode]
  );

  const handleSelectAll = useCallback(() => {
    if (!items.length) return;
    setSelectedIds(new Set(items.map(item => item.entry.id)));
  }, [items]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkAction = useCallback(
    (action: string) => {
      if (!action || selectedIds.size === 0) return;
      const targeted = items.filter(item => selectedIds.has(item.entry.id));
      if (targeted.length === 0) return;

      if (action === 'delete') {
        targeted.forEach(item => {
          removeAsset(item.entry.id, { broadcast: true });
        });
        setSelectedIds(new Set());
        return;
      }

      if (action === 'export') {
        if (typeof window === 'undefined' || typeof URL.createObjectURL !== 'function') {
          console.warn('Manifest export is not supported in this environment.');
          return;
        }
        const exportEntries = targeted.map(({ entry }) => ({
          id: entry.id,
          sha256: entry.sha256,
          bytes: entry.bytes,
          title: entry.title,
          notes: entry.notes,
          url: entry.url,
        }));
        const payload = JSON.stringify({ entries: exportEntries }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `asset-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
    },
    [items, removeAsset, selectedIds]
  );

  const processFileList = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      if (manifestEntries.length === 0) {
        console.warn('No manifest available to map uploaded assets.');
        return;
      }

      const ctx = getAudioContext();
      await Promise.all(
        Array.from(fileList).map(async file => {
          try {
            const array = await file.arrayBuffer();
            const hash = (await digestSha256(array)).toLowerCase();
            registerRawAsset(hash, array, file.type || undefined);
            const entry =
              manifestEntries.find(item => item.sha256?.toLowerCase() === hash) ??
              manifestEntries.find(item => item.id === file.name);
            if (!entry) return;

            setAssetProgress(entry.id, 0, entry.bytes);
            const buffer = await ctx.decodeAudioData(array.slice(0));
            setBuffer(entry.id, buffer);
            setAssetProgress(entry.id, entry.bytes, entry.bytes);
            addAsset(entry.id, { broadcast: true });
          } catch (err) {
            console.error('Failed to process uploaded asset', err);
          }
        })
      );
    },
    [addAsset, manifestEntries, setAssetProgress]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    event => {
      void processFileList(event.target.files);
      event.target.value = '';
    },
    [processFileList]
  );

  const bulkActionOptionsDisabled = selectedIds.size === 0;
  const selectedCount = selectedIds.size;
  const isFacilitator = role === 'facilitator';
  const fallbackWidth = ensurePositive(contentSize.width, 960);
  const columnCount = viewMode === 'grid' ? getColumnCount(fallbackWidth) : 1;
  const rawColumnWidth = Math.floor(fallbackWidth / columnCount);
  const gridColumnWidth = Math.min(fallbackWidth, Math.max(240, rawColumnWidth));
  const gridRowCount = Math.max(1, Math.ceil(items.length / columnCount));
  const gridHeight = Math.min(gridRowCount * (GRID_CARD_HEIGHT + GRID_GAP), 720);
  const listHeight = Math.min(Math.max(items.length, 1) * (LIST_CARD_HEIGHT + GRID_GAP), 720);
  const isLoading = connection !== 'connected' && manifestEntries.length === 0;
  const hasItems = items.length > 0;

  const gridData = useMemo(
    () => ({
      items,
      columnCount,
      onToggleSelect: handleToggleSelect,
      isSelected,
      isFacilitator,
      actionState,
      onLoad: handleLoad,
      onUnload: handleUnload,
    }),
    [items, columnCount, handleToggleSelect, isSelected, isFacilitator, actionState, handleLoad, handleUnload]
  );

  const listData = useMemo(
    () => ({
      items,
      onToggleSelect: handleToggleSelect,
      isSelected,
      isFacilitator,
      actionState,
      onLoad: handleLoad,
      onUnload: handleUnload,
    }),
    [items, handleToggleSelect, isSelected, isFacilitator, actionState, handleLoad, handleUnload]
  );

  return (
    <GlassCard className="w-full overflow-hidden">
      <GlassCardHeader className="gap-6">
        <div className="flex flex-col gap-3">
          <GlassCardTitle>Asset Library</GlassCardTitle>
          <GlassCardDescription>
            Organise, verify, and control the assets shared for this session.
          </GlassCardDescription>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search by name, ID, or notes"
                className="pl-10 pr-3"
                aria-label="Search assets"
              />
            </div>
            <Select
              value={filterMode}
              onChange={event => setFilterMode(event.target.value as FilterMode)}
              className="w-[160px]"
              aria-label="Filter assets"
            >
              <option value="all">All assets</option>
              <option value="loaded">Loaded locally</option>
              <option value="missing">Missing locally</option>
            </Select>
            <Select
              value={sortMode}
              onChange={event => setSortMode(event.target.value as SortMode)}
              className="w-[160px]"
              aria-label="Sort assets"
            >
              <option value="name">Sort by name</option>
              <option value="size">Sort by size</option>
              <option value="date">Sort by date</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white/10 p-1">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                glass
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                leadingIcon={<LayoutGrid className="h-4 w-4" />}
              >
                Grid
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'list' ? 'primary' : 'ghost'}
                glass
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                leadingIcon={<ListIcon className="h-4 w-4" />}
              >
                List
              </Button>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              glass
              leadingIcon={<Upload className="h-4 w-4" />}
              onClick={handleUploadClick}
            >
              Upload
            </Button>
          </div>
        </div>
      </GlassCardHeader>
      <GlassCardContent ref={contentRef} className="gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={bulkMode ? 'secondary' : 'ghost'}
              size="sm"
              glass
              onClick={() => setBulkMode(mode => !mode)}
            >
              {bulkMode ? 'Exit bulk selection' : 'Bulk select'}
            </Button>
            {bulkMode ? (
              <>
                <span className="text-xs font-medium uppercase tracking-[0.35em] text-slate-300">
                  {selectedCount} selected
                </span>
                <Button type="button" variant="ghost" size="sm" glass onClick={handleSelectAll}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" glass onClick={handleClearSelection}>
                  Clear
                </Button>
                <Select
                  value={bulkActionValue}
                  onChange={event => {
                    const value = event.target.value;
                    setBulkActionValue('');
                    handleBulkAction(value);
                  }}
                  disabled={bulkActionOptionsDisabled}
                  className="w-[170px]"
                  aria-label="Bulk actions"
                >
                  <option value="" disabled>
                    Bulk actions
                  </option>
                  <option value="delete">Remove from device</option>
                  <option value="export">Export manifest</option>
                </Select>
              </>
            ) : null}
          </div>
          <div className="text-xs uppercase tracking-[0.35em] text-slate-400">
            {manifestEntries.length} assets in manifest
          </div>
        </div>
        {isLoading ? (
          createSkeleton(viewMode === 'grid' ? 4 : 3)
        ) : hasItems ? (
          <div className="w-full">
            {viewMode === 'grid' ? (
              <Grid
                height={gridHeight}
                width={fallbackWidth}
                columnCount={columnCount}
                columnWidth={gridColumnWidth}
                rowCount={gridRowCount}
                rowHeight={GRID_CARD_HEIGHT + GRID_GAP}
                itemData={gridData}
              >
                {props => <GridCell {...props} />}
              </Grid>
            ) : (
              <List
                height={listHeight}
                width={fallbackWidth}
                itemCount={items.length}
                itemSize={LIST_CARD_HEIGHT + GRID_GAP}
                itemData={listData}
              >
                {props => <ListRow {...props} />}
              </List>
            )}
          </div>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
            <h4 className="text-lg font-semibold text-white">No assets match your current view</h4>
            <p className="max-w-lg text-sm text-slate-200">
              Try adjusting the search, filter, or sort options. Once assets are shared by the facilitator, they will appear here automatically.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              glass
              onClick={() => {
                setSearchQuery('');
                setFilterMode('all');
                setSortMode('name');
              }}
            >
              Reset filters
            </Button>
          </div>
        )}
      </GlassCardContent>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,application/octet-stream"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </GlassCard>
  );
}
