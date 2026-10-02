import { CalendarClock, CheckCheck, Inbox } from 'lucide-react';

export type Visao = 'caixa' | 'adiados' | 'concluidos';

export const VISOES: { id: Visao; rotulo: string; icone: typeof Inbox }[] = [
  { id: 'caixa', rotulo: 'Caixa', icone: Inbox },
  { id: 'adiados', rotulo: 'Adiados', icone: CalendarClock },
  { id: 'concluidos', rotulo: 'Concluídos', icone: CheckCheck },
];
