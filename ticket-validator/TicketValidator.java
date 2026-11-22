import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;
import java.util.UUID;

/** Offline MEHFIL event ticket checker. */
public final class TicketValidator {
    private static final String CHECKED_IN_FILE = "checked-in.csv";
    private static final String TICKET_HEADER = "registration_id,event_id,registration_status";
    private static final String CHECK_IN_HEADER = "registration_id,event_id,checked_in_at,attendance_status";

    private TicketValidator() {}

    public static void main(String[] args) {
        int exitCode;
        try {
            exitCode = run(args);
        } catch (IOException | IllegalArgumentException error) {
            System.err.println("ERROR: " + error.getMessage());
            exitCode = 2;
        }
        if (exitCode != 0) System.exit(exitCode);
    }

    private static int run(String[] args) throws IOException {
        if (args.length == 0 || (args.length == 1 && isHelp(args[0]))) {
            printUsage();
            return args.length == 0 ? 2 : 0;
        }

        Path ticketsFile = Path.of(args[0]).toAbsolutePath().normalize();
        String requestedEvent = null;
        String oneShotRegistration = null;
        if (args.length == 2) {
            if (args[1].equals("--event") || args[1].equals("--check") || isHelp(args[1])) {
                printUsage();
                return 2;
            }
            // Keep the original two-argument command working as a one-ticket check.
            oneShotRegistration = args[1];
        } else if (args.length == 3) {
            if (args[1].equals("--event")) requestedEvent = args[2];
            else if (args[1].equals("--check")) oneShotRegistration = args[2];
            else {
                printUsage();
                return 2;
            }
        } else if (args.length > 3) {
            printUsage();
            return 2;
        }

        List<Ticket> tickets = readTickets(ticketsFile);
        if (tickets.isEmpty()) throw new IOException("ticket CSV contains no registrations.");
        Map<UUID, Ticket> ticketsById = new LinkedHashMap<>();
        Set<UUID> eventIds = new LinkedHashSet<>();
        for (Ticket ticket : tickets) {
            if (ticketsById.putIfAbsent(ticket.registrationId(), ticket) != null) {
                throw new IOException("ticket CSV contains duplicate registration IDs.");
            }
            eventIds.add(ticket.eventId());
        }

        Path checkInsFile = ticketsFile.getParent().resolve(CHECKED_IN_FILE);
        Set<String> checkedIn = readCheckIns(checkInsFile);
        if (oneShotRegistration != null) {
            ScanResult result = checkIn(oneShotRegistration, null, ticketsById, checkedIn, checkInsFile);
            return result == ScanResult.CHECKED_IN ? 0 : 1;
        }

        try (Scanner input = new Scanner(System.in, StandardCharsets.UTF_8)) {
            UUID eventId = chooseEvent(eventIds, requestedEvent, input);
            runInteractive(input, eventId, ticketsById, checkedIn, checkInsFile);
        }
        return 0;
    }

    private static List<Ticket> readTickets(Path file) throws IOException {
        if (!Files.isRegularFile(file)) throw new IOException("ticket CSV does not exist: " + file);
        List<List<String>> records = parseCsv(Files.readString(file, StandardCharsets.UTF_8));
        if (records.isEmpty()) throw new IOException("ticket CSV is empty.");

        Map<String, Integer> columns = headerColumns(records.get(0));
        int registrationIndex = requiredColumn(columns, "registration_id");
        int eventIndex = requiredColumn(columns, "event_id");
        int statusIndex = requiredColumn(columns, "registration_status");
        int maximumIndex = Math.max(registrationIndex, Math.max(eventIndex, statusIndex));
        List<Ticket> tickets = new ArrayList<>();

        for (int rowIndex = 1; rowIndex < records.size(); rowIndex++) {
            List<String> row = records.get(rowIndex);
            if (row.stream().allMatch(String::isBlank)) continue;
            if (row.size() <= maximumIndex) {
                throw new IOException("ticket CSV row " + (rowIndex + 1) + " is missing required columns.");
            }

            UUID registrationId = parseUuid(row.get(registrationIndex), "registration ID on row " + (rowIndex + 1));
            UUID eventId = parseUuid(row.get(eventIndex), "event ID on row " + (rowIndex + 1));
            String status = row.get(statusIndex).trim().toUpperCase(Locale.ROOT);
            if (status.isEmpty()) throw new IOException("ticket CSV row " + (rowIndex + 1) + " has no registration status.");
            tickets.add(new Ticket(registrationId, eventId, status));
        }
        return tickets;
    }

    private static Set<String> readCheckIns(Path file) throws IOException {
        Set<String> values = new LinkedHashSet<>();
        if (!Files.exists(file)) return values;

        List<List<String>> records = parseCsv(Files.readString(file, StandardCharsets.UTF_8));
        if (records.isEmpty()) return values;
        Map<String, Integer> columns = headerColumns(records.get(0));
        int registrationIndex = requiredColumn(columns, "registration_id");
        int eventIndex = requiredColumn(columns, "event_id");
        int statusIndex = requiredColumn(columns, "attendance_status");
        int maximumIndex = Math.max(registrationIndex, Math.max(eventIndex, statusIndex));

        for (int rowIndex = 1; rowIndex < records.size(); rowIndex++) {
            List<String> row = records.get(rowIndex);
            if (row.stream().allMatch(String::isBlank)) continue;
            if (row.size() <= maximumIndex) {
                throw new IOException("check-in CSV row " + (rowIndex + 1) + " is missing required columns.");
            }
            if ("PRESENT".equalsIgnoreCase(row.get(statusIndex).trim())) {
                UUID registrationId = parseUuid(row.get(registrationIndex), "registration ID in check-in CSV row " + (rowIndex + 1));
                UUID eventId = parseUuid(row.get(eventIndex), "event ID in check-in CSV row " + (rowIndex + 1));
                values.add(checkInKey(registrationId, eventId));
            }
        }
        return values;
    }

    private static Map<String, Integer> headerColumns(List<String> header) {
        Map<String, Integer> columns = new LinkedHashMap<>();
        for (int index = 0; index < header.size(); index++) {
            String name = header.get(index).replace("\uFEFF", "").trim().toLowerCase(Locale.ROOT);
            columns.put(name, index);
        }
        return columns;
    }

    private static int requiredColumn(Map<String, Integer> columns, String name) throws IOException {
        Integer index = columns.get(name);
        if (index == null) {
            throw new IOException("CSV header must contain " + name + ".");
        }
        return index;
    }

    private static List<List<String>> parseCsv(String text) throws IOException {
        List<List<String>> records = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;

        for (int index = 0; index < text.length(); index++) {
            char current = text.charAt(index);
            if (current == '"') {
                if (quoted && index + 1 < text.length() && text.charAt(index + 1) == '"') {
                    cell.append('"');
                    index++;
                } else if (quoted) {
                    quoted = false;
                } else if (cell.length() == 0) {
                    quoted = true;
                } else {
                    throw new IOException("CSV contains a quote in an unquoted field.");
                }
            } else if (current == ',' && !quoted) {
                row.add(cell.toString());
                cell.setLength(0);
            } else if ((current == '\n' || current == '\r') && !quoted) {
                if (current == '\r' && index + 1 < text.length() && text.charAt(index + 1) == '\n') index++;
                row.add(cell.toString());
                records.add(row);
                row = new ArrayList<>();
                cell.setLength(0);
            } else {
                cell.append(current);
            }
        }

        if (quoted) throw new IOException("CSV contains an unclosed quoted field.");
        if (!row.isEmpty() || cell.length() > 0) {
            row.add(cell.toString());
            records.add(row);
        }
        return records;
    }

    private static UUID chooseEvent(Set<UUID> eventIds, String requested, Scanner input) throws IOException {
        if (requested != null) {
            UUID eventId = parseUuid(requested, "event ID");
            if (!eventIds.contains(eventId)) throw new IOException("event ID is not present in this ticket CSV.");
            return eventId;
        }
        if (eventIds.size() == 1) {
            UUID eventId = eventIds.iterator().next();
            System.out.println("Event: " + eventId);
            return eventId;
        }

        System.out.println("This CSV contains multiple events. Choose the event UUID:");
        for (UUID eventId : eventIds) System.out.println("  " + eventId);
        System.out.print("Event UUID: ");
        if (!input.hasNextLine()) throw new IOException("no event was selected.");
        UUID eventId = parseUuid(input.nextLine(), "event ID");
        if (!eventIds.contains(eventId)) throw new IOException("event ID is not present in this ticket CSV.");
        return eventId;
    }

    private static void runInteractive(Scanner input, UUID eventId, Map<UUID, Ticket> tickets,
            Set<String> checkedIn, Path checkInsFile) throws IOException {
        int accepted = 0;
        int rejected = 0;
        int duplicates = 0;
        System.out.println("MEHFIL offline check-in ready. Scan or enter a registration UUID; type q to finish.");

        while (true) {
            System.out.print("Ticket ID: ");
            if (!input.hasNextLine()) break;
            String value = input.nextLine().trim();
            if (value.equalsIgnoreCase("q") || value.equalsIgnoreCase("quit") || value.equalsIgnoreCase("exit")) break;
            if (value.isEmpty()) continue;

            ScanResult result = checkIn(value, eventId, tickets, checkedIn, checkInsFile);
            if (result == ScanResult.CHECKED_IN) accepted++;
            else if (result == ScanResult.ALREADY_CHECKED_IN) duplicates++;
            else rejected++;
        }

        System.out.println();
        System.out.println("Session finished - checked in: " + accepted + ", already checked in: " + duplicates + ", rejected: " + rejected + ".");
        System.out.println("Offline attendance file: " + checkInsFile);
    }

    private static ScanResult checkIn(String input, UUID selectedEvent, Map<UUID, Ticket> tickets,
            Set<String> checkedIn, Path checkInsFile) throws IOException {
        UUID registrationId;
        try {
            registrationId = UUID.fromString(input.trim());
        } catch (IllegalArgumentException error) {
            System.out.println("INVALID: enter a registration UUID.");
            return ScanResult.REJECTED;
        }

        Ticket ticket = tickets.get(registrationId);
        if (ticket == null) {
            System.out.println("INVALID: registration was not found in this event ticket export.");
            return ScanResult.REJECTED;
        }
        if (selectedEvent != null && !ticket.eventId().equals(selectedEvent)) {
            System.out.println("INVALID: ticket belongs to a different event.");
            return ScanResult.REJECTED;
        }
        if (!"CONFIRMED".equals(ticket.registrationStatus())) {
            System.out.println("INVALID: registration status is " + ticket.registrationStatus() + ".");
            return ScanResult.REJECTED;
        }

        String key = checkInKey(ticket.registrationId(), ticket.eventId());
        if (checkedIn.contains(key)) {
            System.out.println("ALREADY CHECKED IN: " + ticket.registrationId());
            return ScanResult.ALREADY_CHECKED_IN;
        }

        String checkedAt = Instant.now().toString();
        appendCheckIn(checkInsFile, ticket, checkedAt);
        checkedIn.add(key);
        System.out.println("VALID - ARRIVAL RECORDED");
        System.out.println("Registration: " + ticket.registrationId());
        System.out.println("Event: " + ticket.eventId());
        System.out.println("Attendance: PRESENT");
        return ScanResult.CHECKED_IN;
    }

    private static void appendCheckIn(Path file, Ticket ticket, String checkedAt) throws IOException {
        boolean needsHeader = !Files.exists(file) || Files.size(file) == 0;
        try (BufferedWriter writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
            if (needsHeader) {
                writer.write(CHECK_IN_HEADER);
                writer.newLine();
            }
            writer.write(ticket.registrationId() + "," + ticket.eventId() + "," + checkedAt + ",PRESENT");
            writer.newLine();
        }
    }

    private static UUID parseUuid(String value, String label) throws IOException {
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException error) {
            throw new IOException(label + " must be a UUID.");
        }
    }

    private static String checkInKey(UUID registrationId, UUID eventId) {
        return eventId + ":" + registrationId;
    }

    private static boolean isHelp(String value) {
        return "--help".equalsIgnoreCase(value) || "-h".equalsIgnoreCase(value);
    }

    private static void printUsage() {
        System.out.println("Usage:");
        System.out.println("  java TicketValidator <tickets.csv>                         Interactive check-in");
        System.out.println("  java TicketValidator <tickets.csv> --event <event-uuid>    Choose an event and check in");
        System.out.println("  java TicketValidator <tickets.csv> --check <registration-uuid>  Check one ticket");
        System.out.println("The original two-argument one-ticket command is also supported.");
    }

    private enum ScanResult { CHECKED_IN, ALREADY_CHECKED_IN, REJECTED }
    private record Ticket(UUID registrationId, UUID eventId, String registrationStatus) {}
}
