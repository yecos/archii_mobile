// Declaraciones de tipos para módulos externos sin tipos nativos
declare module 'react-day-picker' {
  import { FC } from 'react';
  interface DayPickerProps {
    mode?: 'single' | 'multiple' | 'range';
    selected?: Date | Date[] | undefined;
    onSelect?: (date: Date | Date[] | undefined) => void;
    className?: string;
    classNames?: Record<string, string>;
    components?: Record<string, FC<any>>;
    showOutsideDays?: boolean;
    defaultMonth?: Date;
    month?: Date;
    onMonthChange?: (month: Date) => void;
    numberOfMonths?: number;
    disabled?: any;
    modifiers?: Record<string, Date[]>;
    modifiersClassNames?: Record<string, string>;
    [key: string]: any;
  }
  const DayPicker: FC<DayPickerProps>;
  export default DayPicker;
  export type { DayPickerProps };
}

declare module 'embla-carousel-react' {
  export function useEmblaCarousel(options?: any): [
    React.RefObject<HTMLDivElement | null>,
    EmblaCarouselType | undefined
  ];
  interface EmblaCarouselType {
    scrollPrev(): void;
    scrollNext(): void;
    scrollTo(index: number): void;
    scrollSnapList(): number[];
    canScrollPrev(): boolean;
    canScrollNext(): boolean;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback: (...args: any[]) => void): void;
    destroy(): void;
  }
}

declare module 'cmdk' {
  import { FC, HTMLAttributes, ReactNode } from 'react';
  interface CommandProps extends HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
    label?: string;
    shouldFilter?: boolean;
    filter?: (value: string, search: string) => number;
  }
  const Command: FC<CommandProps> & {
    Input: FC<HTMLAttributes<HTMLInputElement>>;
    List: FC<HTMLAttributes<HTMLDivElement>>;
    Empty: FC<HTMLAttributes<HTMLDivElement>>;
    Group: FC<HTMLAttributes<HTMLDivElement>>;
    Item: FC<HTMLAttributes<HTMLDivElement>>;
    Separator: FC<HTMLAttributes<HTMLDivElement>>;
    Shortcut: FC<HTMLAttributes<HTMLSpanElement>>;
  };
  export { Command };
}

declare module 'react-hook-form' {
  import { FieldValues, UseFormReturn, UseFormProps } from 'react-hook-form';
  export { FieldValues, UseFormReturn, UseFormProps };
  export function useForm<T extends FieldValues = FieldValues>(props?: UseFormProps<T>): UseFormReturn<T>;
  export function useFormContext<T extends FieldValues = FieldValues>(): UseFormReturn<T>;
  export const FormProvider: any;
  export const Controller: any;
}

declare module 'react-resizable-panels' {
  import { FC, ReactNode } from 'react';
  interface PanelProps {
    children?: ReactNode;
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
    collapsible?: boolean;
    collapsedSize?: number;
    onResize?: (size: number) => void;
    order?: number;
    className?: string;
    style?: any;
    id?: string;
    ref?: any;
  }
  interface PanelGroupProps {
    children?: ReactNode;
    direction?: 'horizontal' | 'vertical';
    onLayout?: (sizes: number[]) => void;
    className?: string;
    style?: any;
    id?: string;
    autoSaveId?: string;
  }
  interface PanelResizeHandleProps {
    children?: ReactNode;
    className?: string;
    style?: any;
    id?: string;
    disabled?: boolean;
    onDragging?: (isDragging: boolean) => void;
  }
  const Panel: FC<PanelProps>;
  const PanelGroup: FC<PanelGroupProps>;
  const PanelResizeHandle: FC<PanelResizeHandleProps>;
  export { Panel, PanelGroup, PanelResizeHandle };
}
