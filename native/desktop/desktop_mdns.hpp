#pragma once

#include <string>

namespace rayact {

void desktopMdnsStart();
void desktopMdnsStop();
std::string desktopMdnsServersJson();

} // namespace rayact
