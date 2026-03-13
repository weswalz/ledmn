import { Client } from "node-osc";

export class OscService {
  async send(host: string, port: number, oscPath: string, value: string | number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const client = new Client(host, port);
      client.send(oscPath, value, (err) => {
        client.close();
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}
