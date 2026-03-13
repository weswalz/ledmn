declare module "node-osc" {
  export class Client {
    constructor(host: string, port: number);
    send(address: string, value: string | number, callback: (error?: Error | null) => void): void;
    close(): void;
  }
}
