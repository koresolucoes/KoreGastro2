





import { Component, ChangeDetectionStrategy, signal, effect, untracked, input, output, InputSignal, OutputEmitterRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Hall, Table, TableStatus } from '../../../models/db.models';
import { PosDataService } from '../../../services/pos-data.service';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-table-layout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-layout.component.html',
  styleUrls: ['./table-layout.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableLayoutComponent {
  posDataService = inject(PosDataService);
  
  hall: InputSignal<Hall> = input.required<Hall>();
  tables: InputSignal<Table[]> = input.required<Table[]>();
  isEditMode: InputSignal<boolean> = input.required<boolean>();
  employeeNameMap: InputSignal<Map<string, string>> = input.required<Map<string, string>>();
  hallIndex: InputSignal<number> = input.required<number>();
  selectedTable: InputSignal<Table | null> = input<Table | null>(null);
  
  tableClicked: OutputEmitterRef<Table> = output<Table>();
  tableRightClicked: OutputEmitterRef<{ event: MouseEvent, table: Table }> = output();

  // Component state for drag-and-drop
  draggingTableId = signal<string | null>(null);
  dragStartPos = signal({ x: 0, y: 0, tableX: 0, tableY: 0 });

  // Component state for resizing
  resizingTableId = signal<string | null>(null);
  resizeStartPos = signal({ x: 0, y: 0, tableW: 0, tableH: 0 });

  localTables = signal<Table[]>([]);

  constructor() {
    effect(() => {
        const hallId = this.hall().id;
        const allTables = this.tables();
        this.localTables.set(allTables.filter(t => t.hall_id === hallId));
    });

    effect(() => {
        const editMode = this.isEditMode();
        if (!editMode) {
          untracked(() => this.saveLayout());
        }
    });
  }

  getEmployeeName(table: Table): string {
    return (table.employee_id && this.employeeNameMap().get(table.employee_id)) || 'N/A';
  }

  onRightClick(event: MouseEvent, table: Table) {
    event.preventDefault();
    this.tableRightClicked.emit({ event, table });
  }

  addTable() {
    const hallIndex = this.hallIndex();
    this.localTables.update(currentTablesInHall => {
        const baseNumber = hallIndex * 100;
        const existingNumbers = new Set(currentTablesInHall.map(t => t.number));
        
        let nextNumber = (hallIndex === 0) ? 1 : baseNumber + 1;

        // Find the smallest available number starting from the base or 1
        while (existingNumbers.has(nextNumber)) {
            nextNumber++;
        }

        const columnCount = 8; // Tables per row before wrapping
        const tableWidth = 80;
        const tableHeight = 80;
        const gap = 20;

        // Calculate grid position based on the number of existing tables in this hall
        const col = currentTablesInHall.length % columnCount;
        const row = Math.floor(currentTablesInHall.length / columnCount);

        const newX = gap + col * (tableWidth + gap);
        const newY = gap + row * (tableHeight + gap);
        
        const newTable: Table = {
            id: `temp-${uuidv4()}`, 
            number: nextNumber, 
            hall_id: this.hall().id, 
            status: 'LIVRE', 
            x: newX, 
            y: newY, 
            width: tableWidth, 
            height: tableHeight, 
            created_at: new Date().toISOString(), 
            user_id: ''
        };

        return [...currentTablesInHall, newTable];
    });
  }

  deleteTable(tableId: string, event: MouseEvent) {
    event.stopPropagation();
    this.localTables.update(tables => tables.filter(t => t.id !== tableId));
  }
  
  updateTableNumber(tableId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const newNumber = parseInt(input.value, 10);
    if (!isNaN(newNumber) && newNumber > 0) {
        this.localTables.update(tables => tables.map(t =>
            t.id === tableId ? { ...t, number: newNumber } : t
        ));
    } else {
        const oldValue = this.localTables().find(t => t.id === tableId)?.number;
        input.value = oldValue ? String(oldValue) : '';
    }
  }

  async saveLayout() {
    const tablesToSave = this.localTables();
    if (tablesToSave.length > 0) {
        await this.posDataService.upsertTables(tablesToSave);
    }
    const allTablesInHall = this.tables().filter(t => t.hall_id === this.hall().id);
    const tablesToDelete = allTablesInHall.filter(t => !tablesToSave.some(lt => lt.id === t.id) && !t.id.startsWith('temp-'));
    for (const table of tablesToDelete) {
        await this.posDataService.deleteTable(table.id);
    }
  }

  // --- Drag and Drop Logic ---
  onDragStart(event: MouseEvent, table: Table) {
    if (!this.isEditMode()) return;
    event.preventDefault();
    this.draggingTableId.set(table.id);
    this.dragStartPos.set({ x: event.clientX, y: event.clientY, tableX: table.x, tableY: table.y });
    window.addEventListener('mousemove', this.onDragMove);
    window.addEventListener('mouseup', this.onDragEnd);
  }

  onDragMove = (event: MouseEvent) => {
    if (!this.draggingTableId()) return;
    const { x, y, tableX, tableY } = this.dragStartPos();
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    this.localTables.update(tables => tables.map(t =>
      t.id === this.draggingTableId() ? { ...t, x: tableX + dx, y: tableY + dy } : t
    ));
  };

  onDragEnd = () => {
    this.draggingTableId.set(null);
    window.removeEventListener('mousemove', this.onDragMove);
    window.removeEventListener('mouseup', this.onDragEnd);
  };

  // --- Resize Logic ---
  onResizeStart(event: MouseEvent, table: Table) {
    if (!this.isEditMode()) return;
    event.stopPropagation();
    event.preventDefault();
    
    this.resizingTableId.set(table.id);
    this.resizeStartPos.set({ 
        x: event.clientX, 
        y: event.clientY, 
        tableW: table.width, 
        tableH: table.height 
    });

    window.addEventListener('mousemove', this.onResizeMove);
    window.addEventListener('mouseup', this.onResizeEnd);
  }

  onResizeMove = (event: MouseEvent) => {
      const resizingId = this.resizingTableId();
      if (!resizingId) return;

      const { x, y, tableW, tableH } = this.resizeStartPos();
      const dx = event.clientX - x;
      const dy = event.clientY - y;

      this.localTables.update(tables => tables.map(t => {
          if (t.id === resizingId) {
              const newWidth = Math.max(50, tableW + dx);
              const newHeight = Math.max(50, tableH + dy);
              return { ...t, width: newWidth, height: newHeight };
          }
          return t;
      }));
  };

  onResizeEnd = () => {
      this.resizingTableId.set(null);
      window.removeEventListener('mousemove', this.onResizeMove);
      window.removeEventListener('mouseup', this.onResizeEnd);
  };


  getStatusClass(status: TableStatus): string {
    switch (status) {
      case 'LIVRE': return 'border-green-500 bg-green-500/10 text-green-300';
      case 'OCUPADA': return 'border-yellow-500 bg-yellow-500/10 text-yellow-300';
      case 'PAGANDO': return 'border-blue-500 bg-blue-500/10 text-blue-300';
      default: return 'border-gray-500 bg-gray-500/10 text-gray-300';
    }
  }
}