module.exports = class Queue {
    /**
     * @typedef SAME_DATA_TYPE the data type used in the queue should be the same
     * 
     * Creates a Queue.
     * @param {SAME_DATA_TYPE} data the data that will stored.
     * The programmer is expected to make sure the data is all the same type.
     */
    constructor(data = null) {
        if (data == null) {
            this.head = null
            this.tail = null
            this.count = 0
        } else {
            this.head = {
                "data": data,
                "next": null
            }
            this.tail = this.head
            this.count = 1
        }
    }

    /**
     * Adds an entry to the queue.
     * @param {SAME_DATA_TYPE} data the data to be added
     */
    add(data) {
        this.count++
        if (this.head == null) {
            this.head = {
                "data": data,
                "next": null
            }
            this.tail = this.head
        } else {
            const node = {
                "data": data,
                "next": null
            }
            this.tail.next = node
            this.tail = node
        }
    }

    /**
     * Gets the next item in the queue taking it out of the queue.
     * @returns the first item in the queue, null if nothing in queue
     */
    next() {
        if (this.count == 0) {
            return null
        }

        this.count--
        const DATA = this.head.data
        this.head = this.head.next
        return DATA
    }

    /**
     * Gets the next item in the queue, does NOT take item out of queue.
     * @returns the first item in the queue, null if nothing in queue
     */
    peak() {
        return this.head ? this.head.data : null
    }

    /**
     * Gets the total number of elements in the queue.
     * @returns total size
     */
    size() {
        return this.count
    }

    /**
     * Clears the queue of all items.
     * WARNING this can NOT be undone!
     */
    clear() {
        this.head = null
    }
}