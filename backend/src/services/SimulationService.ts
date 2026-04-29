// Import necessary classes/engines
import { MRPEngine } from './MRPEngine'; // Adjust the import based on your structure
import { DDMRPEngine } from './DDMRPEngine'; // Adjust the import based on your structure

export class SimulationService {
    private mrpEngine: MRPEngine;
    private ddmrpEngine: DDMRPEngine;

    constructor() {
        this.mrpEngine = new MRPEngine();
        this.ddmrpEngine = new DDMRPEngine();
    }

    public async runSimulation(scenario: string): Promise<any> {
        const simulationDuration = 26; // Weeks

        // Run both engines in parallel
        const mrpResultsPromise = this.mrpEngine.runSimulation(scenario, simulationDuration);
        const ddmrpResultsPromise = this.ddmrpEngine.runSimulation(scenario, simulationDuration);

        // Await results from both engines
        const [mrpResults, ddmrpResults] = await Promise.all([mrpResultsPromise, ddmrpResultsPromise]);

        // Return the results for comparison
        return {
            mrpResults,
            ddmrpResults,
        };
    }
}