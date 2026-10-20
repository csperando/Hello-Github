import pool from "../config/db";
import { logger } from "../config/logger";

// define the type of the return object from the repo() method
export interface iDesignPaintStatusesRepo {
    getAll: () => Promise<any[]>;
}

// main repo init function to be called in the service factories
const repo = (): iDesignPaintStatusesRepo => {
    // the definition rows (code/label/description) for a selection's worked-out paint_status
    const getAll = async () => {
        try {
            const sqlString = `SELECT code, label, description FROM design_paint_statuses ORDER BY sort_order;`;
            const result = await pool.query(sqlString);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        getAll,
    }
};

export default { repo };
