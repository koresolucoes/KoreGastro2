// FIX: Add 'inject' to the import from '@angular/core' to resolve the 'Cannot find name inject' error.
import { Component, ChangeDetectionStrategy, signal, computed, effect, untracked, input, output, InputSignal, OutputEmitterRef, inject } from '@angular/core';
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
  tableClicked: OutputEmitterRef<Table> = output<Table>();
  tableRightClicked: OutputEmitterRef<{ event: MouseEvent, table: Table }> = output();


  // Component state for drag-and-drop
  draggingTableId = signal<string | null>(null);
  dragStartPos = signal({ x: 0, y: 0, tableX: 0, tableY: 0 });

  localTables = signal<Table[]>([]);

  constructor() {
    effect(() => {
        const hallId = this.hall().id;
        const allTables = this.tables();
        untracked(() => {
            this.localTables.set(allTables.filter(t => t.hall_id === hallId));
        });
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
    const nextNumber = Math.max(0, ...this.localTables().map(t => t.number)) + 1;
    this.localTables.update(tables => [...tables, {
        id: `temp-${uuidv4()}`, number: nextNumber, hall_id: this.hall().id, status: 'LIVRE', x: 20, y: 20, width: 80, height: 80, created_at: new Date().toISOString(), user_id: ''
    }]);
  }

  deleteTable(tableId: string, event: MouseEvent) {
    event.stopPropagation();
    this.localTables.update(tables => tables.filter(t => t.id !== tableId));
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

  getStatusClass(status: TableStatus): string {
    switch (status) {
      case 'LIVRE': return 'border-green-500 bg-green-500/10 text-green-300';
      case 'OCUPADA': return 'border-yellow-500 bg-yellow-500/10 text-yellow-300';
      case 'PAGANDO': return 'border-blue-500 bg-blue-500/10 text-blue-300';
      default: return 'border-gray-500 bg-gray-500/10 text-gray-300';
    }
  }
}
