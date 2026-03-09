package irc

import (
	"fmt"
	"net"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func resolveBindHost(bindHost string) string {
	bindHost = normalizeHost(bindHost)
	if bindHost == "" {
		return defaultServerBindHost
	}
	return bindHost
}

func advertiseServerHost(bindHost string) string {
	bindHost = normalizeHost(bindHost)
	if bindHost == "" {
		return defaultServerAdvertiseHost
	}
	if ip := net.ParseIP(bindHost); ip != nil {
		switch {
		case ip.IsLoopback():
			return defaultServerAdvertiseHost
		case ip.IsUnspecified():
			if host, ok := firstNonLoopbackInterfaceAddr(ip.To4() == nil); ok {
				return host
			}
		default:
			if ipv4 := ip.To4(); ipv4 != nil {
				return ipv4.String()
			}
			return ip.String()
		}
	}
	if strings.EqualFold(bindHost, defaultServerAdvertiseHost) {
		return defaultServerAdvertiseHost
	}
	return bindHost
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(host)
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") && len(host) >= 2 {
		return host[1 : len(host)-1]
	}
	return host
}

func firstNonLoopbackInterfaceAddr(wantIPv6 bool) (string, bool) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", false
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip := interfaceAddrIP(addr)
			if ip == nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() {
				continue
			}
			if wantIPv6 {
				if ip.To4() != nil {
					continue
				}
			} else {
				ipv4 := ip.To4()
				if ipv4 == nil {
					continue
				}
				ip = ipv4
			}
			return ip.String(), true
		}
	}
	return "", false
}

func interfaceAddrIP(addr net.Addr) net.IP {
	switch v := addr.(type) {
	case *net.IPNet:
		return v.IP
	case *net.IPAddr:
		return v.IP
	default:
		return nil
	}
}

func localURLForHost(host string, port int) string {
	return (&url.URL{
		Scheme: "http",
		Host:   net.JoinHostPort(host, strconv.Itoa(port)),
	}).String()
}

// killPortHolder finds and kills the process listening on the given port.
func killPortHolder(port int) error {
	out, err := exec.Command("lsof", "-t", "-i", fmt.Sprintf(":%d", port)).Output()
	if err != nil {
		return err
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		pid, err := strconv.Atoi(strings.TrimSpace(line))
		if err != nil || pid <= 0 {
			continue
		}
		syscall.Kill(pid, syscall.SIGTERM)
	}
	time.Sleep(500 * time.Millisecond)
	return nil
}
