declare module 'react-window' {
  import * as React from 'react';

  export interface ListOnScrollProps {
    scrollDirection: 'forward' | 'backward';
    scrollOffset: number;
    scrollUpdateWasRequested: boolean;
  }

  export interface GridOnScrollProps extends ListOnScrollProps {
    horizontalScrollDirection: 'forward' | 'backward';
    scrollLeft: number;
    scrollTop: number;
    verticalScrollDirection: 'forward' | 'backward';
  }

  export type FixedSizeListProps<ItemData = any> = {
    className?: string;
    height: number;
    itemCount: number;
    itemSize: number;
    width: number | string;
    itemData?: ItemData;
    innerElementType?: React.ElementType;
    outerElementType?: React.ElementType;
    overscanCount?: number;
    onItemsRendered?: (props: {
      overscanStartIndex: number;
      overscanStopIndex: number;
      visibleStartIndex: number;
      visibleStopIndex: number;
    }) => void;
    onScroll?: (props: ListOnScrollProps) => void;
    children: (props: {
      data: ItemData;
      index: number;
      isScrolling?: boolean;
      style: React.CSSProperties;
    }) => React.ReactNode;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

  export type FixedSizeGridProps<ItemData = any> = {
    className?: string;
    columnCount: number;
    columnWidth: number;
    height: number;
    rowCount: number;
    rowHeight: number;
    width: number | string;
    itemData?: ItemData;
    innerElementType?: React.ElementType;
    outerElementType?: React.ElementType;
    overscanColumnCount?: number;
    overscanRowCount?: number;
    onScroll?: (props: GridOnScrollProps) => void;
    onItemsRendered?: (props: {
      overscanColumnStartIndex: number;
      overscanColumnStopIndex: number;
      overscanRowStartIndex: number;
      overscanRowStopIndex: number;
      visibleColumnStartIndex: number;
      visibleColumnStopIndex: number;
      visibleRowStartIndex: number;
      visibleRowStopIndex: number;
    }) => void;
    children: (props: {
      columnIndex: number;
      data: ItemData;
      rowIndex: number;
      style: React.CSSProperties;
      isScrolling?: boolean;
    }) => React.ReactNode;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

  export const FixedSizeList: <ItemData = any>(
    props: FixedSizeListProps<ItemData>,
  ) => React.ReactElement | null;

  export const FixedSizeGrid: <ItemData = any>(
    props: FixedSizeGridProps<ItemData>,
  ) => React.ReactElement | null;
}

