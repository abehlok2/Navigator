declare module 'react-window' {
  import * as React from 'react';

  export interface ListChildComponentProps<ItemData = unknown> {
    index: number;
    style: React.CSSProperties;
    data: ItemData;
    isScrolling?: boolean;
    isVisible?: boolean;
  }

  export interface GridChildComponentProps<ItemData = unknown> {
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
    data: ItemData;
    isScrolling?: boolean;
    isVisible?: boolean;
  }

  export interface FixedSizeListProps<ItemData = unknown>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    height: number;
    width: number | string;
    itemCount: number;
    itemSize: number;
    itemData?: ItemData;
    overscanCount?: number;
    children: React.ComponentType<ListChildComponentProps<ItemData>>;
  }

  export interface FixedSizeGridProps<ItemData = unknown>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    height: number;
    width: number | string;
    columnCount: number;
    columnWidth: number;
    rowCount: number;
    rowHeight: number;
    itemData?: ItemData;
    overscanRowCount?: number;
    overscanColumnCount?: number;
    children: React.ComponentType<GridChildComponentProps<ItemData>>;
  }

  export const FixedSizeList: <ItemData = unknown>(
    props: FixedSizeListProps<ItemData> & { ref?: React.Ref<unknown> },
  ) => React.ReactElement | null;

  export const FixedSizeGrid: <ItemData = unknown>(
    props: FixedSizeGridProps<ItemData> & { ref?: React.Ref<unknown> },
  ) => React.ReactElement | null;
}
