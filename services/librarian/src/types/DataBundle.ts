export interface DataBundle {
    id: string;   // GUID used to store and access the data
    data: any;    // Payload
    timestamp: string; // Time when the data was stored
}
