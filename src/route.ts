export type Route =
  | { name: 'library' }
  | { name: 'editor'; id: string }
  | { name: 'run'; id: string }
  | { name: 'history' }
  | { name: 'settings' };

export type Navigate = (route: Route) => void;
