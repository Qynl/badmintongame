export class EventBus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const arr = this.handlers.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  emit(type, data) {
    const arr = this.handlers.get(type);
    if (arr) for (let i = 0; i < arr.length; i++) arr[i](data, type);
    const any = this.handlers.get('*');
    if (any) for (let i = 0; i < any.length; i++) any[i](data, type);
  }

  clear() { this.handlers.clear(); this.log.length = 0; }
}
